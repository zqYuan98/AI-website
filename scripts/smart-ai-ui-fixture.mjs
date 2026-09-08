/**
 * Offline UI fixture: node scripts/smart-ai-ui-fixture.mjs
 * Check seeding/contracts without opening ports: append --check.
 * Original smart-ui-fixture.mjs remains unchanged.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { getMigrations } from 'better-auth/db/migration';
import { createPglitePool } from './lib/pglite-pool.mjs';
import { createTsLoader } from './lib/load-ts.mjs';
import { createOwnerAccount } from './cloud-auth-operations.mjs';
import { createSmartAiFixtureData, FIXTURE_MODEL_URL, FIXTURE_SCENARIOS } from './lib/smart-ai-ui-fixture-data.mjs';

const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
if ((!checkOnly && process.argv.length !== 2) || process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Offline fixture only; use no arguments or --check.');
const origin = 'http://127.0.0.1:4320';
const ownerId = 'smart-ai-ui-fixture-owner';
const databaseURL = 'postgresql://postgres:fixture@127.0.0.1:5439/postgres';
const encryptionKey = randomBytes(32).toString('base64');
const authConfig = { ownerId, baseURL: origin, secret: randomBytes(48).toString('base64'), databaseURL };
// Explicit fixture values supersede any inherited or subsequently loaded .env file.
Object.assign(process.env, {
  NODE_ENV: 'development', RESOURCE_LIBRARY_MODE: 'cloud', DATABASE_URL: databaseURL, DATABASE_ADMIN_URL: databaseURL,
  LIBRARY_PUBLIC_DATABASE_URL: 'postgresql://fixture_public:fixture@127.0.0.1:5439/postgres',
  BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: authConfig.secret, LIBRARY_OWNER_ID: ownerId,
  LIBRARY_API_ENCRYPTION_KEY: encryptionKey, NEXT_TELEMETRY_DISABLED: '1',
});
const db = new PGlite();
const pool = createPglitePool(db);
let app, httpServer, socketServer, terminal;
let shuttingDown = false;
const activeWorkers = new Set();
const timers = new Map();
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const [timer, resolve] of timers) { clearTimeout(timer); resolve(); }
  timers.clear();
  terminal?.close();
  await new Promise(resolve => httpServer?.close(resolve) ?? resolve());
  await app?.close();
  await socketServer?.stop();
  await Promise.allSettled([...activeWorkers]);
  await db.close();
}

try {
  for (const name of ['library-001.sql', 'library-002-imports.sql', 'library-003-smart-api.sql', 'library-004-analysis.sql']) await db.exec(fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  const auth = createTsLoader()('src/lib/server/auth.ts').createOwnerAuth(pool, authConfig);
  await (await getMigrations(auth.options)).runMigrations();
  await createOwnerAccount(auth, ownerId, 'smart-fixture-owner@example.test', 'SmartImport-Fixture-2026!');
  const empty = { version: 1, resources: [], publishedAt: '' };
  await pool.query('INSERT INTO library_private.state(owner_id,state) VALUES($1,$2::jsonb)', [ownerId, JSON.stringify(empty)]);
  await pool.query('INSERT INTO library_public.snapshot(snapshot) VALUES($1::jsonb)', [JSON.stringify(empty)]);
  const fixture = await createSmartAiFixtureData(pool, ownerId, encryptionKey);

  async function checkCollection() {
    const entry = fixture.batches.collected;
    const page = number => fixture.imports.handle({ action: 'get', batchId: entry.batchId, page: number, filters: { resultStatus: 'collected' } }, ownerId);
    const detail = groupId => fixture.imports.handle({ action: 'group', batchId: entry.batchId, groupId }, ownerId);
    const first = await page(1), second = await page(2);
    assert.equal(first.total, 59);
    assert.equal(first.groups.length, 50);
    assert.equal(second.groups.length, 9);
    assert.equal(new Set([...first.groups, ...second.groups].map(group => group.id)).size, 59);
    const linked = (await detail(entry.linked.groupId)).group;
    assert.equal(linked.outcome.kind, 'linked');
    assert.equal(linked.currentCollection.resource.name, '我已修改的收藏名称 · 关联示例');
    assert.equal(linked.currentCollection.resource.description, '这是现有收藏中的手工说明；关联导入不应覆盖它。');
    assert.equal(linked.currentCollection.resource.category, '学习与研究');
    assert.notEqual(linked.currentCollection.resource.name, linked.representative.name);
    assert.equal((await detail(entry.published.groupId)).group.currentCollection.publishedInSnapshot, true);
    const removed = await fixture.imports.handle({ action: 'get', batchId: entry.batchId, page: 1, filters: { resultStatus: 'removed' } }, ownerId);
    assert.equal(removed.total, 2);
    assert.equal((await detail(entry.archived.groupId)).group.currentCollection.state, 'archived');
    const missing = await detail(entry.missing.groupId);
    assert.equal(missing.group.currentCollection.state, 'missing');
    assert.equal(missing.group.currentCollection.resource, null);
    await assert.rejects(fixture.imports.handle({ action: 'collection', mode: 'restore', batchId: entry.batchId, groupId: entry.missing.groupId, expectedResourceId: entry.missing.resourceId, batchRevision: missing.batchRevision, libraryRevision: missing.libraryRevision, requestId: randomUUID() }, ownerId), error => error.status === 409);

    const publicationBefore = (await pool.query('SELECT snapshot FROM library_public.snapshot')).rows[0].snapshot;
    // Move a real second-page item out, retry the same request, then restore it.
    const boundary = second.groups[0];
    async function change(groupId, resourceId, mode) {
      const current = await detail(groupId);
      const input = { action: 'collection', mode, batchId: entry.batchId, groupId, expectedResourceId: resourceId, batchRevision: current.batchRevision, libraryRevision: current.libraryRevision, requestId: randomUUID() };
      const result = await fixture.imports.handle(input, ownerId);
      assert.equal(result.receipt.items[0].status, mode === 'archive' ? 'archived' : 'restored');
      assert.equal((await fixture.imports.handle(input, ownerId)).replayed, true);
      return result;
    }
    await change(boundary.id, boundary.currentCollection.resourceId, 'archive');
    assert.equal((await page(2)).groups.length, 8);
    assert.equal((await detail(boundary.id)).group.resultStatus, 'removed');
    await change(boundary.id, boundary.currentCollection.resourceId, 'restore');
    assert.equal((await page(2)).groups.length, 9);
    assert.deepEqual((await detail(boundary.id)).group.outcome, boundary.outcome);
    await change(entry.archived.groupId, entry.archived.resourceId, 'restore');
    const restored = (await fixture.library.handle({ action: 'list' }, ownerId)).resources.find(resource => resource.id === entry.archived.resourceId);
    assert.equal(restored.status, 'organized');
    assert.equal(restored.visibility, 'private');
    await change(entry.archived.groupId, entry.archived.resourceId, 'archive');
    assert.deepEqual((await pool.query('SELECT snapshot FROM library_public.snapshot')).rows[0].snapshot, publicationBefore);
    assert.equal((await page(1)).total, 59);
    console.log('[smart-ai-ui-fixture] Collection checks passed: 59 active / 2 removed, real commit + link, 50-row pagination, archive/restore replay, missing protection, unchanged publication.');
  }

  async function check() {
    await checkCollection();
    const config = await fixture.settings.read(ownerId);
    assert.equal(config.enabled, true);
    assert.equal(config.settings.baseUrl, FIXTURE_MODEL_URL);
    const ready = fixture.batches.ready;
    const page = await fixture.imports.handle({ action: 'get', batchId: ready.batchId, page: 1, filters: { view: 'all' } }, ownerId);
    const preview = await fixture.analysis.preview({ batchId: ready.batchId, batchRevision: page.batchRevision, groupIds: page.groups.map(group => group.id), configVersion: config.version, limit: 5 }, ownerId);
    assert.equal(preview.targets.length, 5);
    assert.equal(preview.config.baseUrl, FIXTURE_MODEL_URL);
    assert(preview.targets.every(target => target.domain === 'example.com'));
    assert.equal((await fixture.analysis.get(ready.oldJobId, ownerId)).job.config.version, '1');
    for (const scenario of FIXTURE_SCENARIOS.filter(name => name !== 'ready')) {
      const entry = fixture.batches[scenario];
      const { job } = await fixture.analysis.get(entry.currentJobId, ownerId);
      assert.equal(job.status, scenario === 'paused-error' ? 'paused' : scenario);
      assert.equal(job.config.version, config.version);
      assert(job.succeeded > 0);
    }
    const completed = await fixture.imports.handle({ action: 'get', batchId: fixture.batches.completed.batchId, page: 1, filters: { view: 'all' } }, ownerId);
    assert(completed.groups.some(group => group.proposal.fields.description === '这条简介由我手工填写，AI 不应替换。'));
    assert(completed.groups.some(group => group.proposal.fields.description.startsWith('离线示例用途')));
    const started = await fixture.analysis.start({ confirmation: preview.confirmation, requestId: randomUUID() }, ownerId);
    await fixture.analysis.processNext(started.job.id);
    assert.equal((await fixture.analysis.get(started.job.id, ownerId)).job.status, 'completed');
    assert.equal(fixture.simulatedCompletions, 1);
    await fixture.setTestFailure(true);
    await assert.rejects(fixture.settings.test(ownerId, config.version));
    assert.equal((await fixture.settings.read(ownerId)).enabled, false);
    await fixture.setTestFailure(false);
    await fixture.settings.test(ownerId, config.version);
    await fixture.settings.setEnabled(ownerId, config.version, true);
    assert.equal((await fixture.settings.read(ownerId)).enabled, true);
    console.log('[smart-ai-ui-fixture] Offline config, preview-five, jobs, manual preservation, simulated completion and failure-disable checks passed. No ports opened.');
  }

  if (checkOnly) {
    await check();
    await shutdown();
  } else {
    fixture.overrides['./auth'] = { getOwnerSession: async headers => {
      const session = await auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } });
      if (!session || session.user.id !== ownerId || session.session.expiresAt.getTime() <= Date.now()) return null;
      return { user: { id: ownerId, email: session.user.email } };
    } };
    const { ownerJsonPost, privateUnsupportedMethod } = fixture.load('src/lib/server/owner-json-api.ts');
    const jobsRunning = new Set();
    function dispatch(jobId) {
      if (jobsRunning.has(jobId) || shuttingDown) return;
      jobsRunning.add(jobId);
      const work = (async () => {
        try {
          for (let index = 0; index < 100 && !shuttingDown; index++) {
            await new Promise(resolve => { const timer = setTimeout(() => { timers.delete(timer); resolve(); }, 1500); timers.set(timer, resolve); });
            if (shuttingDown || !(await fixture.analysis.processNext(jobId)).more) break;
          }
        } finally { jobsRunning.delete(jobId); }
      })();
      activeWorkers.add(work);
      void work.catch(() => console.error('[smart-ai-ui-fixture] Simulated worker stopped; no external request was made.')).finally(() => activeWorkers.delete(work));
    }
    const analysisPost = ownerJsonPost(async (input, id) => {
      const result = await fixture.analysis.handle(input, id);
      if (['start', 'resume'].includes(input.action) && result.job?.status === 'queued') dispatch(result.job.id);
      return result;
    });
    const settingsPost = ownerJsonPost(async (input, id) => {
      if (input.action === 'read') return fixture.settings.read(id);
      if (input.action === 'save') return fixture.settings.save(id, input);
      if (input.action === 'test') return fixture.settings.test(id, input.version);
      if (input.action === 'clear-key') return fixture.settings.clearKey(id, input.version);
      if (input.action === 'set-enabled') return fixture.settings.setEnabled(id, input.version, input.enabled);
      throw new Error('Unsupported offline action');
    });
    const intercepts = new Map([['/api/library/analysis', analysisPost], ['/api/library/smart-settings', settingsPost]]);
    socketServer = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 5439, maxConnections: 12, inspect: false, debug: false });
    await socketServer.start();
    const next = (await import('next')).default;
    httpServer = createServer(async (incoming, outgoing) => {
      try {
        const pathname = new URL(incoming.url || '/', origin).pathname.replace(/\/+$/, '');
        const handler = intercepts.get(pathname);
        if (!handler) { await app.getRequestHandler()(incoming, outgoing); return; }
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        let body = '';
        for await (const chunk of incoming) { body += chunk.toString('utf8'); if (Buffer.byteLength(body) > 4 * 1024 * 1024) throw new Error('Body limit'); }
        const response = incoming.method === 'POST' ? await handler(new Request(origin + pathname, { method: 'POST', headers, body })) : privateUnsupportedMethod();
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch { outgoing.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); outgoing.end(JSON.stringify({ error: '离线验收服务暂时无法处理此操作。' })); }
    });
    app = next({ dev: true, hostname: '127.0.0.1', port: 4320, httpServer });
    await app.prepare();
    await new Promise((resolve, reject) => { httpServer.once('error', reject); httpServer.listen(4320, '127.0.0.1', resolve); });
    function showLinks() {
      console.log(`[smart-ai-ui-fixture] Login: ${origin}/login (synthetic fixture account).`);
      for (const [name, item] of Object.entries(fixture.batches)) console.log(`[smart-ai-ui-fixture] ${name}: ${origin}/tools/manage/imports/${item.batchId}`);
      console.log('[smart-ai-ui-fixture] collected: 59 active resources across 2 pages; 2 removed examples (archived / missing). Includes a modified linked resource and a published snapshot resource.');
      console.log('[smart-ai-ui-fixture] Commands on stdin: links | test-fails on | test-fails off | run current | quit. All model results are simulated locally.');
    }
    showLinks();
    terminal = createInterface({ input: process.stdin, terminal: false });
    terminal.on('line', async line => {
      const command = line.trim();
      try {
        if (command === 'links') showLinks();
        else if (command === 'test-fails on' || command === 'test-fails off') { await fixture.setTestFailure(command.endsWith(' on')); console.log('[smart-ai-ui-fixture] Simulated connection-test outcome updated; rate-limit fixture reset.'); }
        else if (command === 'run current') dispatch(fixture.batches.running.currentJobId);
        else if (command === 'quit') { await shutdown(); process.exit(0); }
      } catch { console.error('[smart-ai-ui-fixture] Fixture command failed.'); }
    });
    process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
    process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });
  }
} catch (error) {
  // Fixture diagnostics only; no production configuration is ever loaded.
  console.error('[smart-ai-ui-fixture] Offline fixture failed:', error instanceof Error ? error.message : 'Unknown fixture failure');
  await shutdown();
  process.exitCode = 1;
}
