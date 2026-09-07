/** Exercise the real API boundary and public mode selection with isolated dependencies. */
import assert from 'node:assert/strict';
import { createTsLoader } from './lib/load-ts.mjs';

const oldMode = process.env.RESOURCE_LIBRARY_MODE;
const oldOrigin = process.env.BETTER_AUTH_URL;
const origin = 'https://owner.example';
let enabled = true;
let session = null;
let actions = 0;
let authReads = 0;
let refreshes = 0;
let refreshFailure = false;
let storeFailure;
const overrides = {
  '@/lib/server/config': { cloudLibraryEnabled: () => enabled },
  '@/lib/server/auth': { getOwnerSession: async () => { authReads++; return session; } },
  '@/lib/cloud-library': { handleCloudLibraryAction: async (_input, owner) => {
    assert.equal(owner, 'fixed-owner'); actions++;
    if (storeFailure) throw storeFailure;
    return { libraryRevision: '3', resources: [], publishedAt: '2026-09-07T00:00:00Z', count: 0 };
  } },
  '@/lib/site-resources': { refreshPublicLibrary: () => {
    refreshes++; if (refreshFailure) throw new Error('cache unavailable');
  } },
};
const load = createTsLoader(process.cwd(), overrides);
const { LibraryInputError } = load('src/lib/library-domain.ts');
const route = load('src/app/api/library/route.ts');
function request(input = { action: 'list' }, options = {}) {
  return new Request(`${origin}/api/library`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...options.headers },
    body: typeof input === 'string' ? input : JSON.stringify(input),
  });
}
async function expectStatus(input, status) {
  const response = await route.POST(input);
  assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control'), /no-store/);
  return response;
}
try {
  process.env.BETTER_AUTH_URL = origin;
  enabled = false;
  await expectStatus(request(), 404);
  assert.equal(authReads, 0);
  assert.equal(actions, 0);
  assert.equal(route.GET().status, 404);
  enabled = true;
  for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']) assert.equal(route[method]().status, 405);
  await expectStatus(request({}, { headers: { origin: 'https://untrusted.example' } }), 403);
  await expectStatus(request({}, { headers: { origin: '' } }), 403);
  await expectStatus(request({}, { headers: { 'sec-fetch-site': 'cross-site' } }), 403);
  assert.equal(authReads, 0);
  await expectStatus(request(), 401);
  assert.equal(actions, 0, 'Anonymous requests cannot read or write the library');
  session = { user: { id: 'fixed-owner', email: 'owner@example.test' } };
  await expectStatus(request({}, { headers: { 'content-type': 'text/plain' } }), 415);
  await expectStatus(request('{not JSON'), 400);
  await expectStatus(request('[]'), 400);
  await expectStatus(request({}, { headers: { 'content-length': String(5 * 1024 * 1024) } }), 413);
  await expectStatus(request('x'.repeat(4 * 1024 * 1024 + 1)), 413);
  assert.equal(actions, 0);
  await expectStatus(request(), 200);
  assert.equal(actions, 1);
  assert.equal(refreshes, 0, 'Ordinary library actions cannot invalidate publication');
  storeFailure = new LibraryInputError('数据已变化，请重新读取。', 409);
  await expectStatus(request({ action: 'save' }), 409);
  storeFailure = new Error('postgres://private:SECRET@private.example/db');
  const unavailable = await expectStatus(request(), 503);
  assert(!JSON.stringify(await unavailable.json()).includes('SECRET'));
  storeFailure = undefined;
  const published = await expectStatus(request({ action: 'publish' }), 200);
  assert.equal((await published.json()).cacheStatus, 'refreshed');
  refreshFailure = true;
  const pending = await expectStatus(request({ action: 'publish' }), 200);
  const saved = await pending.json();
  assert.equal(saved.cacheStatus, 'pending');
  assert.equal(saved.libraryRevision, '3', 'A committed publication cannot be reported as a failed transaction');
  refreshFailure = false;
  const beforeRetry = actions;
  await expectStatus(request({ action: 'refresh-publication' }), 200);
  assert.equal(actions, beforeRetry, 'Cache refresh retry cannot repeat the mutation');

  let legacyReads = 0;
  let cloudReads = 0;
  let cloudFailure = false;
  const publicLoad = createTsLoader(process.cwd(), {
    'next/cache': { unstable_cache: fn => fn, revalidatePath() {}, revalidateTag() {} },
    './server/config': { cloudLibraryEnabled: () => enabled },
    './public-resources': { getPublicResources: () => { legacyReads++; return [{ id: 'old-public' }]; } },
    './cloud-publication': { readCloudPublicSnapshot: async () => {
      cloudReads++; if (cloudFailure) throw new Error('unavailable'); return { resources: [] };
    } },
  });
  const publicData = publicLoad('src/lib/site-resources.ts');
  assert.deepEqual(await publicData.getSitePublicResources(), []);
  assert.equal(legacyReads, 0, 'Empty cloud publication must not resurrect legacy resources');
  cloudFailure = true;
  await assert.rejects(publicData.getSitePublicResources());
  assert.equal(legacyReads, 0, 'Cloud failure must not fall back to legacy publication');
  enabled = false;
  assert.equal((await publicData.getSitePublicResources())[0].id, 'old-public');
  assert.equal(cloudReads, 2);
  console.log('[cloud-api] Access, CSRF, payload limits, private errors, publication cache retry and empty/error boundaries passed.');
} finally {
  if (oldMode === undefined) delete process.env.RESOURCE_LIBRARY_MODE; else process.env.RESOURCE_LIBRARY_MODE = oldMode;
  if (oldOrigin === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = oldOrigin;
}
