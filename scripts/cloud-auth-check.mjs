/** Real Better Auth + PostgreSQL-engine integration. No remote database or accounts. */
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { getMigrations } from 'better-auth/db/migration';
import { createTsLoader } from './lib/load-ts.mjs';
import { createOwnerAccount, resetOwnerPassword } from './cloud-auth-operations.mjs';
import { createPglitePool } from './lib/pglite-pool.mjs';

const origin = 'https://owner.example.test';
const ownerId = 'test-fixed-owner';
const password = 'isolated-test-password-47';
const original = { ...process.env };
const database = new PGlite();
const pool = createPglitePool(database);
Object.assign(process.env, {
  NODE_ENV: 'test', RESOURCE_LIBRARY_MODE: 'cloud', DATABASE_URL: 'postgresql://unused:unused@localhost/isolated',
  BETTER_AUTH_SECRET: 'isolated-auth-test-secret-at-least-32-characters-long', BETTER_AUTH_URL: origin, LIBRARY_OWNER_ID: ownerId,
});
const load = createTsLoader(process.cwd(), { './database': { getDatabasePool: () => pool } });
const { getAuth, getOwnerSession, createOwnerAuth, AUTH_TABLES } = load('src/lib/server/auth.ts');
const { getCloudAuthConfig, cloudAuthConfigured } = load('src/lib/server/config.ts');
const route = load('src/app/api/auth/[...all]/route.ts');
const auth = getAuth();
const context = await auth.$context;
function request(path, method = 'POST', body = {}, cookie = '', ip = '198.51.100.10', extra = {}) {
  return new Request(`${origin}/api/auth/${path}`, {
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
  assert(cloudAuthConfigured());
  const migration = await getMigrations(auth.options);
  assert.deepEqual(new Set(migration.toBeCreated.map(item => item.table)), new Set(AUTH_TABLES));
  await migration.runMigrations();
  assert.equal((await getMigrations(auth.options)).toBeCreated.length, 0, 'Migration is repeatable');
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

  process.env.RESOURCE_LIBRARY_MODE = 'local';
  await status(await route.GET(request('get-session', 'GET')), 404);
  process.env.RESOURCE_LIBRARY_MODE = 'cloud';
  delete process.env.BETTER_AUTH_SECRET;
  assert(!cloudAuthConfigured());
  const unavailable = await status(await route.POST(request('sign-in/email')), 503);
  assert(!JSON.stringify(await unavailable.json()).includes('postgres'));
  console.log('[cloud-auth] Real PostgreSQL migrations, bootstrap email validation/normalization with no partial accounts, owner login, signup denial, CSRF, session expiry/logout/recovery, non-owner denial and persisted rate limits passed.');
} finally {
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
  await database.close();
}
