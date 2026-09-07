/** Exercise the actual private-store and route modules with disposable external storage. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createTsLoader } from './lib/load-ts.mjs';

const root = process.cwd();
const load = createTsLoader(root);
const { getPublicResources, getLegacyPublicResources } = load('src/lib/public-resources.ts');
const legacy = getLegacyPublicResources();
const { handleLibraryAction } = load('src/lib/private-library.ts');
const { parseBookmarkHtml, bookmarkUrl, canonicalBookmarkUrl } = load('src/lib/bookmark-import.ts');
const route = load('src/app/api/local-library/route.ts');
const originalPublication = path.join(root, 'content', 'resource-library.json');
const digest = file => fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
const originalDigest = digest(originalPublication);
const previousMode = process.env.NODE_ENV;
const previousDirectory = process.env.VITAMIN_LIBRARY_DIR;
const previousFetch = globalThis.fetch;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vitamin-library-check-'));
const project = path.join(temporary, 'project');
const privateDirectory = path.join(temporary, 'private');
const publication = path.join(project, 'content', 'resource-library.json');
const privateFile = path.join(privateDirectory, 'library.json');
let networkRequests = 0;
const localHeaders = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'content-type': 'application/json' };
function request(body, headers = localHeaders) {
  return new Request('http://127.0.0.1:3000/api/local-library', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}
async function api(body, headers) { return route.POST(request(body, headers)); }
async function action(input) {
  const response = await api(input);
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return data;
}
const saved = (resources, name) => {
  const resource = resources.find(item => item.name === name);
  assert(resource, `Missing resource: ${name}`);
  return resource;
};

try {
  fs.mkdirSync(path.dirname(publication), { recursive: true });
  const fixtureIcons = path.join(project, 'public', 'images', 'tools', 'icons');
  fs.mkdirSync(fixtureIcons, { recursive: true });
  for (const icon of fs.readdirSync(path.join(root, 'public', 'images', 'tools', 'icons'))) {
    fs.writeFileSync(path.join(fixtureIcons, icon), fs.readFileSync(path.join(root, 'public', 'images', 'tools', 'icons', icon)));
  }
  process.chdir(project);
  process.env.NODE_ENV = 'development';
  process.env.VITAMIN_LIBRARY_DIR = privateDirectory;
  globalThis.fetch = async () => { networkRequests++; throw new Error('Private resource operations must not access the network.'); };

  // The legacy reader was loaded before changing cwd; the snapshot reader resolves cwd on each call.
  assert(!fs.existsSync(publication));
  let state = await action({ action: 'list' });
  assert.deepEqual(state.resources.map(item => item.id), legacy.map(item => item.id));
  assert.deepEqual(state.resources.map(item => item.url), legacy.map(item => item.url));
  assert(state.resources.every(item => item.visibility === 'public' && item.status === 'organized'));
  assert(state.resources.every(item => item.createdAt === ''), 'Unknown historical collection dates must remain unknown');
  assert.equal(state.publishedAt, '');
  assert(fs.existsSync(privateFile));
  assert(!fs.existsSync(publication), 'Opening the manager must not publish anything');

  state = await action({ action: 'save', resource: {
    name: 'PRIVATE_SENTINEL_SAVE', url: 'https://private-save.example/work', notes: 'PRIVATE_SENTINEL_NOTE',
    visibility: 'public', status: 'organized', usedByVitamin: true, sourceFolder: 'FORGED_FOLDER', pinned: true,
  } });
  const personal = saved(state.resources, 'PRIVATE_SENTINEL_SAVE');
  assert.equal(personal.visibility, 'private');
  assert.equal(personal.status, 'inbox');
  assert.equal(personal.usedByVitamin, false);
  assert.equal(personal.sourceFolder, '');
  assert.equal(personal.notes, 'PRIVATE_SENTINEL_NOTE');
  assert.equal(personal.pinned, true);
  assert.equal(personal.icon, '');
  assert.equal((await api({ action: 'bulk', ids: [personal.id], changes: { visibility: 'public' } })).status, 400);
  assert(!fs.existsSync(publication));
  assert(!JSON.stringify(getPublicResources()).includes('PRIVATE_SENTINEL'));
  assert.equal((await api({ action: 'save', resource: { ...personal, id: 'forged-id' } })).status, 404);
  assert.equal((await api({ action: 'save', resource: { name: 'Duplicate', url: 'https://private-save.example/work?utm_source=import' } })).status, 409);
  assert.equal((await api({ action: 'save', resource: { ...personal, featured: true } })).status, 400);
  assert.equal((await api({ action: 'save', resource: { name: 'Bad', url: 'javascript:alert(1)' } })).status, 400);
  state = await action({ action: 'save', resource: { name: 'LOCAL_SENTINEL', url: 'http://127.0.0.1:9090/work' } });
  const local = saved(state.resources, 'LOCAL_SENTINEL');
  assert.equal((await api({ action: 'bulk', ids: [local.id], changes: { visibility: 'public', status: 'organized' } })).status, 400);

  // Simultaneous API mutations retain every item and do not leave partial JSON files.
  await Promise.all(Array.from({ length: 8 }, (_, index) => action({ action: 'save', resource: { name: `Concurrent ${index}`, url: `https://concurrent.example/${index}` } })));
  state = await action({ action: 'list' });
  assert.equal(state.resources.filter(item => item.name.startsWith('Concurrent ')).length, 8);
  assert.deepEqual(fs.readdirSync(privateDirectory), ['library.json']);

  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>
    <DT><H3>PRIVATE_FOLDER_SENTINEL</H3><DL><p>
      <DT><A HREF="https://bookmark.example/a?x=1&amp;y=2" ADD_DATE="1700000000">A &amp; &#x4E2D;</A>
      <DT><H3>Nested</H3><DL><p><DT><A HREF='https://bookmark.example/b'>B</A></DL><p>
      <DT><A HREF="https://bookmark.example/a?x=1&amp;y=2&amp;utm_source=nav">Duplicate in file</A>
      <DT><A HREF="https://private-save.example/work">Existing</A>
      <DT><A HREF="javascript:alert(1)">Invalid</A>
      <script><A HREF="https://script.example">Never a bookmark</A></script>
      <style><A HREF="https://style.example">Never a bookmark</A></style>
    </DL><p><DT><A HREF="https://bookmark.example/c" title="quoted > attribute">C</A></DL>`;
  const importedPreview = await action({ action: 'import-preview', html });
  assert.equal(importedPreview.items.length, 3);
  assert.equal(importedPreview.duplicates, 2);
  assert.equal(importedPreview.invalid, 1);
  assert.equal(importedPreview.invalidItems.length, 1);
  assert.equal(importedPreview.invalidItems[0].name, 'Invalid');
  assert(importedPreview.invalidItems[0].reason.includes('HTTP / HTTPS'));
  assert.equal(importedPreview.items[0].name, 'A & 中');
  assert.equal(importedPreview.items[0].sourceFolder, 'PRIVATE_FOLDER_SENTINEL');
  assert.equal(importedPreview.items[1].sourceFolder, 'PRIVATE_FOLDER_SENTINEL / Nested');
  assert.equal(importedPreview.items[2].sourceFolder, '');
  assert.equal(importedPreview.items[0].createdAt, '2023-11-14T22:13:20.000Z');
  assert.equal(importedPreview.items[1].createdAt, '');
  assert.throws(() => parseBookmarkHtml('a'.repeat(2 * 1024 * 1024 + 1)));
  assert.throws(() => parseBookmarkHtml('<A HREF="https://example.com">x</A>'.repeat(5001)));
  for (const url of ['data:text/html,x', 'file:///private', 'https://user:password@example.com', 'javascript:alert(1)']) assert.throws(() => bookmarkUrl(url));
  assert.notEqual(canonicalBookmarkUrl('https://vercel.com'), canonicalBookmarkUrl('https://vercel.com/dashboard'));
  assert.notEqual(canonicalBookmarkUrl('https://example.com'), canonicalBookmarkUrl('https://www.example.com'));
  assert.notEqual(canonicalBookmarkUrl('https://example.com/path'), canonicalBookmarkUrl('https://example.com/path/'));
  assert.notEqual(canonicalBookmarkUrl('https://example.com?a=1&b=2'), canonicalBookmarkUrl('https://example.com?b=2&a=1'));
  const imported = await action({ action: 'import', items: [...importedPreview.items, importedPreview.items[0]] });
  assert.equal(imported.added, 3);
  assert.equal(imported.skipped, 1);
  assert(imported.batchId);
  const batch = imported.resources.filter(item => item.importBatchId === imported.batchId);
  assert.equal(batch.length, 3);
  assert(batch.every(item => item.status === 'inbox' && item.visibility === 'private' && !item.featured && !item.usedByVitamin && !item.icon));
  assert(batch.every(item => typeof item.importedAt === 'string' && Number.isFinite(Date.parse(item.importedAt))));
  assert.equal(saved(batch, 'B').createdAt, '');
  assert.equal((await action({ action: 'import', items: importedPreview.items })).added, 0);
  assert.equal((await api({ action: 'import', items: [{ name: 'Injected', url: 'file:///secret' }] })).status, 400);

  const stablePreview = await action({ action: 'publish-preview' });
  assert.deepEqual(stablePreview.added, []);
  assert.deepEqual(stablePreview.removed, []);
  assert(!JSON.stringify(stablePreview.resources).includes('PRIVATE_SENTINEL'));
  const publishable = batch[0];
  state = await action({ action: 'save', resource: {
    ...publishable, name: 'Public sample', visibility: 'public', status: 'organized', recommendation: 'I recommend this resource for its useful examples.',
    notes: 'PUBLIC_ENTRY_PRIVATE_NOTE', usedByVitamin: true, featured: true, kind: 'article', category: '学习与研究', tags: ['Examples'],
  } });
  assert.equal(saved(state.resources, 'Public sample').usedByVitamin, false);
  assert.equal((await api({ action: 'publish', revision: stablePreview.revision })).status, 409);
  assert(!fs.existsSync(publication));
  let next = await action({ action: 'publish-preview' });
  assert.deepEqual(next.added, [publishable.id]);
  assert.deepEqual(next.removed, []);
  assert.equal(next.resources.length, legacy.length + 1);
  const publicEntry = next.resources.find(item => item.id === publishable.id);
  for (const key of ['notes', 'source', 'sourceFolder', 'createdAt', 'importedAt', 'importBatchId', 'pinned', 'status', 'visibility']) assert(!(key in publicEntry));
  const published = await action({ action: 'publish', revision: next.revision });
  assert.equal(published.count, legacy.length + 1);
  assert(published.publishedAt);
  const publishedText = fs.readFileSync(publication, 'utf8');
  for (const sentinel of ['PRIVATE_SENTINEL', 'PRIVATE_FOLDER_SENTINEL', 'PUBLIC_ENTRY_PRIVATE_NOTE', 'LOCAL_SENTINEL', 'Concurrent']) assert(!publishedText.includes(sentinel), sentinel);
  assert.equal(getPublicResources().length, legacy.length + 1);
  for (const original of legacy) assert(getPublicResources().some(item => item.id === original.id && item.url === original.url));

  const publishedDigest = digest(publication);
  await action({ action: 'bulk', ids: [publishable.id], changes: { status: 'archived' } });
  assert.equal(digest(publication), publishedDigest, 'Ordinary edits must not alter the public snapshot');
  const undo = await action({ action: 'undo-import', batchId: imported.batchId });
  assert.equal(undo.removed, 2);
  const retained = undo.resources.find(item => item.id === publishable.id);
  assert(retained, 'Undo must retain an item that was published, even if archived later');
  assert.equal(retained.visibility, 'private');
  assert.equal(retained.featured, false);
  assert(undo.resources.some(item => item.id === personal.id), 'Undo must not remove pre-existing resources');
  next = await action({ action: 'publish-preview' });
  assert.deepEqual(next.removed, [publishable.id]);
  assert(!JSON.stringify(next.resources).includes('Public sample'));
  // Changing the public file independently also invalidates a preview.
  const externalSnapshot = JSON.parse(fs.readFileSync(publication, 'utf8'));
  externalSnapshot.publishedAt = '2000-01-01T00:00:00.000Z';
  fs.writeFileSync(publication, JSON.stringify(externalSnapshot));
  assert.equal((await api({ action: 'publish', revision: next.revision })).status, 409);
  next = await action({ action: 'publish-preview' });
  await action({ action: 'publish', revision: next.revision });
  assert.equal(getPublicResources().length, legacy.length);
  const backup = await action({ action: 'backup' });
  assert.equal(backup.data.version, 1);
  assert.equal(saved(backup.data.resources, 'PRIVATE_SENTINEL_SAVE').notes, 'PRIVATE_SENTINEL_NOTE');
  assert.deepEqual(backup.data, JSON.parse(fs.readFileSync(privateFile, 'utf8')));

  const exited = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8', windowsHide: true });
  assert.equal(exited.status, 0);
  const deadPid = Number(exited.stdout);
  assert(Number.isSafeInteger(deadPid) && deadPid > 0);
  const lockFile = `${privateFile}.lock`;
  fs.writeFileSync(lockFile, JSON.stringify({ pid: deadPid, token: 'abandoned-lock' }));
  await action({ action: 'list' });
  assert(!fs.existsSync(lockFile), 'A crashed process must not permanently block the library');
  const liveLock = JSON.stringify({ pid: process.pid, token: 'live-lock' });
  fs.writeFileSync(lockFile, liveLock);
  assert.equal((await api({ action: 'list' })).status, 409);
  assert.equal(fs.readFileSync(lockFile, 'utf8'), liveLock, 'A live lock must never be removed by a timeout');
  fs.unlinkSync(lockFile);

  // Route security, bounded reads, and error messages that never expose a filesystem path.
  assert.equal((await api({ action: 'list' }, { ...localHeaders, origin: 'https://evil.example' })).status, 403);
  assert.equal((await api({ action: 'list' }, { ...localHeaders, host: 'evil.example', origin: 'http://evil.example' })).status, 403);
  assert.equal((await api({ action: 'list' }, { ...localHeaders, 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await api({ action: 'list' }, { host: localHeaders.host, 'content-type': 'application/json' })).status, 403);
  assert.equal((await api({ action: 'list' }, { ...localHeaders, 'content-type': 'text/plain' })).status, 415);
  assert.equal((await api('{malformed')).status, 400);
  assert.equal((await api(' '.repeat(4 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await api({ action: 'list' }, { ...localHeaders, 'content-length': String(4 * 1024 * 1024 + 1) })).status, 413);
  assert.equal((await api({ action: 'bulk', ids: [personal.id], changes: { notes: 'not an allowed bulk field' } })).status, 400);
  process.env.VITAMIN_LIBRARY_DIR = path.join(project, 'private');
  const unsafeStorage = await api({ action: 'list' });
  assert.equal(unsafeStorage.status, 400);
  assert(!(await unsafeStorage.text()).includes(project));
  assert(!fs.existsSync(path.join(project, 'private')));
  process.env.VITAMIN_LIBRARY_DIR = privateDirectory;
  const validState = fs.readFileSync(privateFile, 'utf8');
  fs.writeFileSync(privateFile, `invalid ${privateDirectory}`);
  const corrupt = await api({ action: 'list' });
  assert.equal(corrupt.status, 500);
  assert(!(await corrupt.text()).includes(privateDirectory));
  fs.writeFileSync(privateFile, validState);
  for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']) assert.equal((await route[method]()).status, 405);
  process.env.NODE_ENV = 'production';
  for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']) assert.equal((await route[method]()).status, 404);
  assert.equal((await api({ action: 'list' })).status, 404);
  await assert.rejects(() => handleLibraryAction({ action: 'backup' }), error => error.status === 404);
  assert.equal(networkRequests, 0);
  assert.equal(digest(originalPublication), originalDigest, 'The real publication file must remain untouched');
  console.log(`PASS: ${legacy.length} existing public resources preserved; private defaults, zero network requests, HTML import/deduplication, atomic concurrent saves, preview revisions, explicit publication allowlist, safe undo/backup, and development-only API guards.`);
} finally {
  process.chdir(root);
  globalThis.fetch = previousFetch;
  if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
  if (previousDirectory === undefined) delete process.env.VITAMIN_LIBRARY_DIR; else process.env.VITAMIN_LIBRARY_DIR = previousDirectory;
  const relative = path.relative(fs.realpathSync(os.tmpdir()), fs.realpathSync(temporary));
  assert(relative.startsWith('vitamin-library-check-') && !relative.includes(path.sep) && !path.isAbsolute(relative), 'Cleanup must stay inside the disposable test directory');
  fs.rmSync(temporary, { recursive: true, force: true });
}
