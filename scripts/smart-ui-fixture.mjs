/** Isolated browser-development fixture. Always creates a fresh in-memory database on loopback. */
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { getMigrations } from 'better-auth/db/migration';
import { createPglitePool } from './lib/pglite-pool.mjs';
import { createTsLoader } from './lib/load-ts.mjs';
import { createOwnerAccount } from './cloud-auth-operations.mjs';

if (process.argv.length !== 2 || process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('This fixture only runs locally without arguments.');
const origin = 'http://127.0.0.1:4320';
const ownerId = 'smart-ui-fixture-owner';
const db = new PGlite();
const pool = createPglitePool(db);
const load = createTsLoader();
const config = { ownerId, baseURL: origin, secret: randomBytes(48).toString('base64'), databaseURL: 'postgresql://postgres:fixture@127.0.0.1:5439/postgres' };
const { createOwnerAuth } = load('src/lib/server/auth.ts');
const auth = createOwnerAuth(pool, config);
let child;
let server;
async function shutdown() {
  child?.kill();
  await server?.stop();
  await db.close();
}
try {
  for (const name of ['library-001.sql', 'library-002-imports.sql', 'library-003-smart-api.sql', 'library-004-analysis.sql']) await db.exec(fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  await (await getMigrations(auth.options)).runMigrations();
  await createOwnerAccount(auth, ownerId, 'smart-fixture-owner@example.test', 'SmartImport-Fixture-2026!');
  const { createCloudLibraryStore } = load('src/lib/cloud-library.ts');
  const library = createCloudLibraryStore(pool, () => ownerId);
  const legacy = load('src/lib/public-resources.ts').getLegacyPublicResources().slice(0, 3);
  const snapshot = { version: 1, publishedAt: '', resources: legacy };
  const initial = await library.initializationPreview(snapshot, ownerId);
  await library.initialize(snapshot, ownerId, initial.confirmation);
  const { createSmartImportStore } = load('src/lib/server/smart-import-store.ts');
  const imports = createSmartImportStore(pool, () => ownerId);
  const content = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><H3>开发与技术</H3><DL>'
    + Array.from({ length: 1000 }, (_, index) => `<DT><A HREF="https://example.com/docs/${index}">开发文档 ${index + 1}</A>`).join('\n')
    + '</DL><DT><H3>重复与私人链接</H3><DL><DT><A HREF="https://example.com/docs/0?utm_source=fixture">另一份文档</A>'
    + `<DT><A HREF="${legacy[0].url}">库内已有资源</A>`
    + '<DT><A HREF="http://127.0.0.1/private">本地管理</A><DT><A HREF="javascript:alert(1)">格式问题</A></DL></DL>';
  const seeded = await imports.handle({ action: 'create', requestId: 'fictional-browser-fixture', name: '虚构的 1000 条开发书签', format: 'html', content }, ownerId);
  server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 5439, maxConnections: 12, inspect: false, debug: false });
  await server.start();
  const env = {
    ...process.env, NODE_ENV: 'development', RESOURCE_LIBRARY_MODE: 'cloud', DATABASE_URL: config.databaseURL,
    DATABASE_ADMIN_URL: config.databaseURL, LIBRARY_PUBLIC_DATABASE_URL: 'postgresql://fixture_public:fixture@127.0.0.1:5439/postgres',
    BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: config.secret, LIBRARY_OWNER_ID: ownerId,
    LIBRARY_API_ENCRYPTION_KEY: randomBytes(32).toString('base64'), NEXT_TELEMETRY_DISABLED: '1',
  };
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '4320'], { env, stdio: 'inherit', windowsHide: true });
  console.log(`[smart-ui-fixture] Isolated login: ${origin}/login; batch: ${seeded.batch.id}. No production connection or model service is used.`);
  child.on('exit', async code => { await server?.stop(); await db.close(); process.exitCode = code ?? 0; });
  process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
  process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });
} catch {
  await shutdown();
  console.error('[smart-ui-fixture] Local fixture could not start. Check the development port and disposable schema.');
  process.exitCode = 1;
}
