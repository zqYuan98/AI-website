/** Better Auth integration. Remote execution requires an explicit disposable CLOUD_AUTH_TEST_DATABASE_URL. */
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { createTsLoader } from './lib/load-ts.mjs';
import { createOwnerAccount, resetOwnerPassword } from './cloud-auth-operations.mjs';
import { createPglitePool } from './lib/pglite-pool.mjs';

const origin = 'https://owner.example.test';
const ownerId = 'test-fixed-owner';
const password = 'isolated-test-password-47';
const original = { ...process.env };
// Do not load .env files or select DATABASE_URL / DATABASE_ADMIN_URL as a test destination.
const testDatabaseURL = process.env.CLOUD_AUTH_TEST_DATABASE_URL?.trim();
const database = testDatabaseURL ? undefined : new PGlite();
const pool = testDatabaseURL
  ? new Pool({ connectionString: testDatabaseURL, max: 4, connectionTimeoutMillis: 10000 })
  : createPglitePool(database);
if (testDatabaseURL) pool.on('error', () => console.error('[cloud-auth] Isolated test database connection failed.'));
Object.assign(process.env, {
  NODE_ENV: 'test', RESOURCE_LIBRARY_MODE: 'cloud', DATABASE_URL: 'postgresql://unused:unused@localhost/isolated',
  BETTER_AUTH_SECRET: 'isolated-auth-test-secret-at-least-32-characters-long', BETTER_AUTH_URL: origin, LIBRARY_OWNER_ID: ownerId,
});
const load = createTsLoader(process.cwd(), { './database': { getDatabasePool: () => pool } });
const { getAuth, getOwnerSession, createOwnerAuth, AUTH_TABLES } = load('src/lib/server/auth.ts');
const { getCloudAuthConfig, cloudAuthConfigured } = load('src/lib/server/config.ts');
const route = load('src/app/api/auth/[...all]/route.ts');
const auth = getAuth();
let phase = 'empty-database preflight';
class ExistingAuthObjectsError extends Error {}
async function assertEmptyAuthDatabase(candidatePool) {
  const existing = await candidatePool.query('SELECT c.relname FROM pg_catalog.pg_class c WHERE c.relname = ANY($1::text[])', [AUTH_TABLES]);
  if (existing.rows.length) throw new ExistingAuthObjectsError('The test destination already contains authentication objects; no migration or fixture writes were started.');
}
function request(path, method = 'POST', body = {}, cookie = '', ip = '198.51.100.10', extra = {}, internalOrigin = origin) {
  return new Request(`${internalOrigin}/api/auth/${path}`, {
    method,
    headers: { origin, 'content-type': 'application/json', 'x-vercel-forwarded-for': ip, cookie, ...extra },
    ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}
const cookie = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const signin = (email, pwd = password, ip = '198.51.100.10') => route.POST(request('sign-in/email', 'POST', { email, password: pwd }, '', ip));
async function status(response, expected) {
  assert.equal(response.status, expected, await response.clone().text());
  assert.match(response.headers.get('cache-control'), /no-store/);
  return response;
}
try {
  await assertEmptyAuthDatabase(pool);
  if (database) {
    // Prove the guard also rejects the mock auth table created by cloud-library-check, without touching its row.
    const guarded = new PGlite();
    const guardedPool = createPglitePool(guarded);
    try {
      await guardedPool.query('CREATE TABLE public.library_auth_user (id text PRIMARY KEY)');
      await guardedPool.query("INSERT INTO public.library_auth_user VALUES ('existing-fixture-must-remain')");
      await assert.rejects(() => assertEmptyAuthDatabase(guardedPool), ExistingAuthObjectsError);
      assert.deepEqual((await guardedPool.query('SELECT id FROM public.library_auth_user')).rows, [{ id: 'existing-fixture-must-remain' }]);
      assert.equal((await guardedPool.query('SELECT count(*)::int AS count FROM pg_catalog.pg_class WHERE relname = ANY($1::text[])', [AUTH_TABLES])).rows[0].count, 1);
    } finally { await guarded.close(); }
  }
  assert(cloudAuthConfigured());
  phase = 'schema migration';
  const migration = await getMigrations(auth.options);
  assert.deepEqual(new Set(migration.toBeCreated.map(item => item.table)), new Set(AUTH_TABLES));
  await migration.runMigrations();
  assert.equal((await getMigrations(auth.options)).toBeCreated.length, 0, 'Migration is repeatable');
  const context = await auth.$context;
  phase = 'fixture account creation';
  for (const email of ['a..b@example.test', '.a@example.test', 'owner@localhost', 'owner @example.test', ' \t\r\n', null, `${'a'.repeat(244)}@example.test`]) {
    await assert.rejects(createOwnerAccount(auth, ownerId, email, password), /邮箱格式不正确/);
    for (const model of ['user', 'account', 'session']) {
      assert.equal((await context.adapter.findMany({ model })).length, 0, `Rejected bootstrap email must not write ${model} rows`);
    }
  }
  await createOwnerAccount(auth, ownerId, ' \tOwner@Example.Test\r\n ', password);
  const createdOwner = await context.adapter.findOne({ model: 'user', where: [{ field: 'id', value: ownerId }] });
  assert.equal(createdOwner?.email, 'owner@example.test', 'Outer whitespace and casing are normalized before validation and storage');
  await assert.rejects(createOwnerAccount(auth, ownerId, 'second@example.test', password), /已有账号/);

  phase = 'owner login, signup and session guards';
  const anonymous = await status(await route.GET(request('get-session', 'GET')), 200);
  assert.equal(await anonymous.json(), null);
  assert.equal(await getOwnerSession(new Headers()), null);
  await status(await route.POST(request('sign-up/email', 'POST', { name: 'Attacker', email: 'new@example.test', password })), 404);
  const directSignup = await auth.handler(request('sign-up/email', 'POST', { name: 'Attacker', email: 'new@example.test', password }));
  assert(directSignup.status >= 400, 'Auth itself closes sign-up, independent of the route allowlist');
  await status(await signin('owner@example.test', 'wrong-password'), 401);
  const loggedIn = await status(await signin('owner@example.test'), 200);
  const firstCookie = cookie(loggedIn);
  assert(firstCookie);
  assert.match(loggedIn.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(loggedIn.headers.get('set-cookie'), /Secure/i);
  assert.match(loggedIn.headers.get('set-cookie'), /SameSite=Lax/i);
  assert.deepEqual(await loggedIn.json(), { user: { id: ownerId, email: 'owner@example.test' } });
  assert.equal((await getOwnerSession(new Headers({ cookie: firstCookie })))?.user.id, ownerId);
  assert.equal((await (await route.GET(request('get-session', 'GET', {}, firstCookie))).json())?.user.id, ownerId);

  phase = 'canonical host and proxy origin guards';
  const canonicalHost = new URL(origin).host;
  const internalOrigin = 'http://localhost:4302';
  const proxyLogin = await status(await route.POST(request('sign-in/email', 'POST', { email: 'owner@example.test', password }, '', '198.51.100.20', { host: canonicalHost, 'sec-fetch-site': 'same-origin' }, internalOrigin)), 200);
  assert.deepEqual(await proxyLogin.json(), { user: { id: ownerId, email: 'owner@example.test' } }, 'An internal URL with the canonical Host and Origin can log in through the actual auth handler');
  const proxyCookie = cookie(proxyLogin);
  assert(proxyCookie);
  const proxySession = await status(await route.GET(request('get-session', 'GET', {}, proxyCookie, '198.51.100.20', { host: canonicalHost }, internalOrigin)), 200);
  assert.equal((await proxySession.json())?.user.id, ownerId);
  const sessionsBeforeRejectedHosts = (await context.adapter.findMany({ model: 'session' })).length;
  for (const host of ['attacker.example', `${canonicalHost}.attacker.example`, `${canonicalHost}:444`, `user@${canonicalHost}`, `user:password@${canonicalHost}`, `${canonicalHost}/`, `${canonicalHost}\\`, `${canonicalHost}?query`, `${canonicalHost}#fragment`, `${canonicalHost},attacker.example`, `${canonicalHost} other`, canonicalHost.replace('.', '%2e'), `${canonicalHost}:`, `https://${canonicalHost}`, '']) {
    await status(await route.POST(request('sign-in/email', 'POST', { email: 'owner@example.test', password }, '', '198.51.100.21', { host })), 403);
  }
  const forwarded = { 'x-forwarded-host': canonicalHost, 'x-forwarded-proto': 'https', forwarded: `host=${canonicalHost};proto=https` };
  await status(await route.POST(request('sign-in/email', 'POST', { email: 'owner@example.test', password }, '', '198.51.100.21', { host: 'attacker.example', ...forwarded })), 403);
  await status(await route.POST(request('sign-in/email', 'POST', { email: 'owner@example.test', password }, '', '198.51.100.21', forwarded, internalOrigin)), 403);
  const missingOrigin = request('sign-in/email', 'POST', { email: 'owner@example.test', password }, '', '198.51.100.21', { host: canonicalHost }, internalOrigin);
  missingOrigin.headers.delete('origin');
  await status(await route.POST(missingOrigin), 403);
  await status(await route.POST(request('sign-in/email', 'POST', { email: 'owner@example.test', password }, '', '198.51.100.21', { host: canonicalHost, 'sec-fetch-site': 'cross-site' }, internalOrigin)), 403);
  await status(await route.GET(request('get-session', 'GET', {}, proxyCookie, '198.51.100.21', { host: 'attacker.example', ...forwarded })), 403);
  assert.equal((await context.adapter.findMany({ model: 'session' })).length, sessionsBeforeRejectedHosts, 'Rejected origin/host requests never create sessions');
  await status(await route.POST(request('sign-out', 'POST', {}, proxyCookie, '198.51.100.20', { host: canonicalHost }, internalOrigin)), 200);
  assert.equal(await getOwnerSession(new Headers({ cookie: proxyCookie })), null);

  await status(await route.POST(request('sign-out', 'POST', {}, firstCookie, '198.51.100.11', { origin: 'https://attacker.example' })), 403);
  await status(await route.POST(request('sign-in/email', 'POST', {}, '', '198.51.100.11', { origin: '' })), 403);
  await status(await route.POST(request('sign-in/email', 'POST', 'x'.repeat(8193))), 413);
  await status(await route.POST(request('sign-out', 'POST', {}, firstCookie)), 200);
  assert.equal(await getOwnerSession(new Headers({ cookie: firstCookie })), null, 'Logged-out token cannot be replayed');

  const now = new Date();
  await context.adapter.create({ model: 'user', forceAllowId: true, data: { id: 'non-owner', email: 'other@example.test', name: 'Other', emailVerified: true, createdAt: now, updatedAt: now } });
  await context.adapter.create({ model: 'account', data: { userId: 'non-owner', accountId: 'non-owner', providerId: 'credential', password: await context.password.hash(password), createdAt: now, updatedAt: now } });
  await status(await signin('other@example.test', password, '198.51.100.12'), 401);

  const expiring = await status(await signin('owner@example.test', password, '198.51.100.13'), 200);
  await context.adapter.updateMany({ model: 'session', where: [{ field: 'userId', value: ownerId }], update: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await getOwnerSession(new Headers({ cookie: cookie(expiring) })), null, 'Expiry is checked against database state');

  phase = 'password recovery and persisted rate limits';
  const beforeReset = await status(await signin('owner@example.test', password, '198.51.100.14'), 200);
  await resetOwnerPassword(auth, ownerId, 'replacement-test-password-89');
  assert.equal(await getOwnerSession(new Headers({ cookie: cookie(beforeReset) })), null, 'Password recovery revokes every old session');
  await status(await signin('owner@example.test', password, '198.51.100.15'), 401);
  await status(await signin('owner@example.test', 'replacement-test-password-89', '198.51.100.16'), 200);

  for (let index = 0; index < 5; index++) await status(await signin('owner@example.test', 'wrong-password', '198.51.100.99'), 401);
  await status(await signin('owner@example.test', 'wrong-password', '198.51.100.99'), 429);
  const restarted = createOwnerAuth(pool, getCloudAuthConfig());
  assert.equal((await restarted.handler(request('sign-in/email', 'POST', { email: 'owner@example.test', password }, '', '198.51.100.99'))).status, 429, 'Rate limit survives a new auth instance');
  assert((await context.adapter.findMany({ model: 'rateLimit' })).length > 0);

  phase = 'disabled and unconfigured route guards';
  process.env.RESOURCE_LIBRARY_MODE = 'local';
  await status(await route.GET(request('get-session', 'GET')), 404);
  process.env.RESOURCE_LIBRARY_MODE = 'cloud';
  delete process.env.BETTER_AUTH_SECRET;
  assert(!cloudAuthConfigured());
  const unavailable = await status(await route.POST(request('sign-in/email')), 503);
  assert(!JSON.stringify(await unavailable.json()).includes('postgres'));
  console.log(`[cloud-auth] ${testDatabaseURL ? 'Isolated PostgreSQL/pg' : 'PGlite PostgreSQL'} empty-database guard, migrations, bootstrap email validation/normalization with no partial accounts, owner login, signup denial, canonical Host/proxy-origin and CSRF guards, session expiry/logout/recovery, non-owner denial and persisted rate limits passed.`);
} catch (error) {
  console.error(error instanceof ExistingAuthObjectsError
    ? '[cloud-auth] Refused: authentication objects already exist. No migration or fixture writes were started; use a separate disposable test database.'
    : `[cloud-auth] Check failed during ${phase}. Connection details, credentials and database diagnostics are omitted.`);
  process.exitCode = 1;
} finally {
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
  try { if (database) await database.close(); else await pool.end(); }
  catch { console.error('[cloud-auth] Test database connection cleanup failed.'); process.exitCode = 1; }
}
