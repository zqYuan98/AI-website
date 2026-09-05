/** Read-only HTTP smoke checks against a running production server. */
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

const args = process.argv.slice(2);
if (args.length > 1 || args[0]?.startsWith('--')) {
  throw new Error('Usage: node scripts/check-smoke.mjs [http(s)://host:port]');
}
const base = new URL(args[0] ?? process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000');
assert(['http:', 'https:'].includes(base.protocol), 'Smoke URL must use HTTP or HTTPS');
assert(!base.username && !base.password && base.pathname === '/' && !base.search && !base.hash,
  'Provide an origin without credentials, path, query or fragment');

// Automatically include future Markdown detail pages without maintaining a second slug list.
const detailRoutes = (await Promise.all(['work', 'blog', 'lab'].map(async (section) => {
  const files = await readdir(new URL(`../content/${section}/`, import.meta.url));
  return files.filter((file) => /\.mdx?$/.test(file)).sort()
    .map((file) => `/${section}/${encodeURIComponent(file.replace(/\.mdx?$/, ''))}`);
}))).flat();
const publicRoutes = ['/', '/about', '/work', '/blog', '/tools', '/lab', ...detailRoutes];

// Allow the CI server time to start, but fail an HTTP error as soon as it responds.
const readyBy = Date.now() + 30_000;
while (true) {
  try {
    const response = await fetch(base, { redirect: 'manual', signal: AbortSignal.timeout(2_000) });
    await response.body?.cancel();
    break;
  } catch (error) {
    if (Date.now() >= readyBy) throw new Error(`Server did not start at ${base.origin}`, { cause: error });
    await setTimeout(500);
  }
}

async function check(route, expectedStatus) {
  const response = await fetch(new URL(route, base), {
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, expectedStatus, `${route}: unexpected status`);
  if (expectedStatus === 200) {
    assert.match(response.headers.get('content-type') ?? '', /text\/html/i, `${route}: expected HTML`);
    const html = (await response.text()).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    assert.equal([...html.matchAll(/<h1\b[^>]*>/gi)].length, 1, `${route}: expected exactly one H1`);
    assert.match(html, /<title\b[^>]*>[^<]+<\/title>/i, `${route}: missing page title`);
  } else {
    await response.body?.cancel();
  }
  console.log(`[smoke] ${expectedStatus} ${route}`);
}

// Keep request concurrency modest; this command also accepts a deployed origin.
for (let offset = 0; offset < publicRoutes.length; offset += 4) {
  await Promise.all(publicRoutes.slice(offset, offset + 4).map((route) => check(route, 200)));
}
await check('/tools/manage', 404);
await check('/api/local-tools', 404);
console.log(`[smoke] Passed ${publicRoutes.length} public pages and 2 production maintenance guards at ${base.origin}`);
