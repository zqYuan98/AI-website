import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PGlite } from '@electric-sql/pglite';
import { createTsLoader } from './lib/load-ts.mjs';
import { createPglitePool } from './lib/pglite-pool.mjs';

const load = createTsLoader();
const security = load('src/lib/server/smart-api-security.ts');
const client = load('src/lib/server/smart-api-client.ts');
const { createApiConfigStore } = load('src/lib/server/smart-api-store.ts');
const { SMART_API_DEFAULT_SETTINGS } = load('src/lib/smart-api-types.ts');
const { RESOURCE_CATEGORIES } = load('src/lib/resource-types.ts');
const status = expected => error => error?.status === expected;
const masterKey = randomBytes(32).toString('base64');
const binding = { ownerId: 'test-owner', configId: 'primary', version: '1', baseUrl: 'https://models.example.com/v1' };
const secret = 'FAKE-TEST-KEY-NOT-A-CREDENTIAL';
const encrypted = security.encryptApiKey(secret, binding, masterKey);
assert.equal(security.decryptApiKey(encrypted, binding, masterKey), secret);
assert.notEqual(security.encryptApiKey(secret, binding, masterKey).iv, encrypted.iv);
for (const field of ['ownerId', 'configId', 'version', 'baseUrl']) {
  assert.throws(() => security.decryptApiKey(encrypted, { ...binding, [field]: `${binding[field]}-changed` }, masterKey), status(503));
}
assert.throws(() => security.decryptApiKey({ ...encrypted, tag: randomBytes(16).toString('base64') }, binding, masterKey), status(503));
assert.throws(() => security.encryptApiKey(secret, binding, 'not-a-master-key'), status(503));

for (const address of ['127.0.0.1', '10.0.1.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.100.100.200', '0.0.0.0', '224.0.0.1', '192.0.2.1', '198.18.0.1', '168.63.129.16', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:8.8.8.8', '::ffff:127.0.0.1', '2001:db8::1', '2002:7f00:1::', '64:ff9b::7f00:1']) {
  assert.equal(security.isPublicAddress(address), false, address);
}
for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(security.isPublicAddress(address), true, address);
for (const url of ['http://example.com', 'https://key@example.com', 'https://example.com?key=x', 'https://example.com#x', 'https://localhost/v1', 'https://service.local', 'https://127.1/v1', 'https://[::1]/v1']) assert.throws(() => security.normalizeApiBaseUrl(url), status(400));
assert.equal(security.normalizeApiBaseUrl('https://MODELS.example.com/v1/'), 'https://models.example.com/v1');
for (const url of ['https://site.local/notes', 'https://home.arpa/notes', 'https://metadata.google.internal', 'https://example.com/admin', 'https://example.com/adm%69n/settings', 'https://example.com/account/notes', 'https://example.com/post?access_token=private', 'https://example.com/post?SESSION=id']) assert.equal(security.publicModelDomain(url), null, url);
assert.equal(security.publicModelDomain('https://www.example.com/articles/design?q=tools#intro'), 'www.example.com');
await assert.rejects(() => security.resolvePublicTarget('https://models.example.com/v1', async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]), status(400));

const item = { id: 'item-1', title: 'Fictional note organizer', domain: 'example.com' };
const suggestion = { id: item.id, kind: 'tool', category: RESOURCE_CATEGORIES[4], tags: ['笔记'], description: '虚构笔记整理工具。', reason: '标题说明用途。', confidence: 'clear' };
const response = { choices: [{ message: { content: JSON.stringify({ suggestions: [suggestion] }) } }], usage: { prompt_tokens: 80, completion_tokens: 50 } };
const settings = { ...SMART_API_DEFAULT_SETTINGS, name: 'Synthetic service', baseUrl: binding.baseUrl, model: 'fixture-model' };
const config = { id: 'primary', version: '1', settings, apiKey: secret };
let networkCalls = 0;
let capturedBody = '';
function transportFixture(payload = response, code = 200, headers = {}) {
  return {
    lookup: async () => [{ address: '8.8.8.8', family: 4 }],
    request: (options, callback) => {
      networkCalls++;
      assert.equal(options.hostname, 'models.example.com');
      assert.equal(options.servername, 'models.example.com');
      assert.equal(options.agent, false);
      assert.equal(options.rejectUnauthorized, true);
      assert.equal(options.method, 'POST');
      assert.equal(options.path, '/v1/chat/completions');
      assert.equal(options.headers.Authorization, `Bearer ${secret}`);
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.equal(options.headers['User-Agent'], 'Vitamin-Resource-Library/1.0');
      options.lookup('models.example.com', {}, (error, address, family) => {
        assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4);
      });
      const request = new EventEmitter();
      request.destroy = error => { if (error) queueMicrotask(() => request.emit('error', error)); return request; };
      request.end = body => {
        capturedBody = String(body);
        queueMicrotask(() => {
          const incoming = new EventEmitter();
          incoming.statusCode = code; incoming.headers = headers;
          incoming.destroy = () => { incoming.emit('close'); };
          callback(incoming);
          if (code === 200) {
            incoming.emit('data', Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)));
            incoming.emit('end');
          }
        });
      };
      return request;
    },
  };
}
const result = await client.postChatCompletion(config, [item], transportFixture());
assert.equal(result.suggestions[0].source, 'model');
assert.deepEqual(result.usage, { inputTokens: 80, outputTokens: 50 });
assert(!capturedBody.includes(secret));
await assert.rejects(() => client.postChatCompletion(config, [{ ...item, domain: 'private.local', notes: 'DO-NOT-SEND' }], transportFixture()), status(400));
const beforeBadDNS = networkCalls;
await assert.rejects(() => client.postChatCompletion(config, [item], { ...transportFixture(), lookup: async () => [{ address: '127.0.0.1', family: 4 }] }), status(400));
assert.equal(networkCalls, beforeBadDNS, 'Blocked DNS must never reach transport');
const beforeGuard = networkCalls;
await assert.rejects(() => client.postChatCompletion(config, [item], { ...transportFixture(), beforeSend: async () => { throw new Error('Lease expired'); } }), /Lease expired/);
assert.equal(networkCalls, beforeGuard, 'An expired durable lease cannot start transport after DNS resolution');
await assert.rejects(() => client.postChatCompletion(config, [item], transportFixture(null, 302, { location: 'https://attacker.example' })), status(502));
await assert.rejects(() => client.postChatCompletion(config, [item], transportFixture(`PROVIDER-SECRET-${secret}`, 401)), error => error.status === 502 && !error.message.includes(secret));
for (const [code, contentType, expectedType] of [
  [401, 'application/json; charset=utf-8', 'json'],
  [401, 'text/html', 'html'],
  [403, 'Text/HTML; charset=UTF-8', 'html'],
  [403, 'application/xhtml+xml', 'html'],
  [403, 'application/problem+json', 'json'],
  [403, undefined, 'other'],
  [403, `application/octet-stream; secret=${secret}`, 'other'],
]) {
  const beforeRejected = networkCalls;
  await assert.rejects(() => client.postChatCompletion(config, [item], transportFixture(`UNTRUSTED-BODY-${secret}`, code,
    { 'content-type': contentType, 'x-provider-secret': secret, 'set-cookie': `credential=${secret}` })), error => {
    assert(error instanceof client.SmartApiCallError);
    assert.equal(error.status, 502, 'The private API keeps its existing gateway-failure status.');
    assert.equal(error.outcome, 'rejected');
    assert.equal(error.upstreamStatus, code);
    assert.equal(error.responseType, expectedType);
    assert(error.message.includes(`HTTP ${code}`));
    assert(!JSON.stringify({ ...error, message: error.message }).includes(secret));
    assert(!error.message.includes('UNTRUSTED-BODY'));
    if (code === 401) assert(error.message.includes('认证未通过'));
    if (code === 403) {
      assert(error.message.includes('拒绝访问'));
      assert(!error.message.includes('Key'));
      assert(!error.message.includes('拒绝鉴权'));
      if (expectedType === 'html') assert(error.message.includes('HTML') && error.message.includes('可能'));
    }
    return true;
  });
  assert.equal(networkCalls, beforeRejected + 1, 'A provider rejection is never retried automatically.');
}
for (const [code, marker, challenged] of [
  [403, 'challenge', true],
  [403, 'Challenge', false],
  [403, ' challenge ', false],
  [403, ['challenge'], false],
  [403, `challenge-${secret}`, false],
  [401, 'challenge', false],
]) {
  const beforeChallenge = networkCalls;
  await assert.rejects(() => client.postChatCompletion(config, [item], transportFixture(`CHALLENGE-PAGE-${secret}`, code,
    { 'content-type': 'text/html', 'cf-mitigated': marker, 'set-cookie': `session=${secret}` })), error => {
    assert.equal(error.upstreamStatus, code);
    assert.equal(error.responseType, 'html');
    assert.equal(error.accessRestriction, challenged ? 'browser_challenge' : undefined);
    assert.equal(error.message.includes('网关要求浏览器验证'), challenged, 'Only an exact 403 challenge marker is recognized.');
    if (challenged) assert(error.message.includes('服务器 API 请求无法完成') && error.message.includes('联系服务方'));
    assert(!JSON.stringify({ ...error, message: error.message }).includes(secret));
    assert(!error.message.includes('CHALLENGE-PAGE'));
    return true;
  });
  assert.equal(networkCalls, beforeChallenge + 1, 'Browser challenges are not solved or retried by this API client.');
}
for (const changed of [{ id: 'unknown' }, { category: 'invented-category' }, { kind: 'unknown' }, { description: 'x'.repeat(1001) }]) {
  const invalid = { choices: [{ message: { content: JSON.stringify({ suggestions: [{ ...suggestion, ...changed }] }) } }] };
  await assert.rejects(() => client.postChatCompletion(config, [item], transportFixture(invalid)), status(502));
}
await assert.rejects(() => client.postChatCompletion(config, [item], transportFixture('x'.repeat(256 * 1024 + 1))), status(502));
await assert.rejects(() => client.postChatCompletion(config, [item], transportFixture({ choices: [{ message: { content: JSON.stringify({ suggestions: [{ ...suggestion, reason: secret }] }) } }] })), error => error.status === 502 && !error.message.includes(secret));
await assert.rejects(() => client.postChatCompletion(config, [item], {
  lookup: async () => [{ address: '8.8.8.8', family: 4 }], timeoutMs: 5,
  request: () => { const request = new EventEmitter(); request.end = () => {}; request.destroy = () => request; return request; },
}), error => error.status === 504 && error.outcome === 'unknown');

const db = new PGlite();
const pool = createPglitePool(db);
let now = Date.parse('2026-09-07T00:00:00Z');
let testCalls = 0;
const owner = binding.ownerId;
const fakeModel = async (_config, items, beforeSend) => {
  await beforeSend?.();
  testCalls++;
  assert.equal(items.length, 1);
  assert.equal(items[0].domain, 'example.com');
  assert(!JSON.stringify(items).includes(secret));
  return { suggestions: [{ ...suggestion, id: items[0].id, source: 'model' }], usage: { inputTokens: 40, outputTokens: 30 } };
};
const store = createApiConfigStore(pool, () => owner, { encryptionKey: () => masterKey, now: () => new Date(now), complete: fakeModel });
try {
  await db.exec(fs.readFileSync(new URL('../migrations/library-001.sql', import.meta.url), 'utf8'));
  await db.exec(fs.readFileSync(new URL('../migrations/library-003-smart-api.sql', import.meta.url), 'utf8'));
  await assert.rejects(() => store.read('not-owner'), status(403));
  assert.equal((await store.read(owner)).version, '0');
  await assert.rejects(() => store.resolve(owner, '0'), status(409));
  let view = await store.save(owner, { version: '0', settings, apiKey: secret });
  assert.equal(view.version, '1'); assert.equal(view.hasKey, true); assert.equal(view.enabled, false);
  assert(!JSON.stringify(view).includes(secret));
  assert.equal(testCalls, 0, 'Saving configuration must not make model requests');
  const persisted = (await pool.query('SELECT encrypted_key FROM library_private.smart_api_settings')).rows[0].encrypted_key;
  assert(!JSON.stringify(persisted).includes(secret));
  await assert.rejects(() => pool.query('UPDATE library_private.smart_api_settings SET enabled=true'), error => error.code === '23514');
  await assert.rejects(() => store.save(owner, { version: '0', settings }), status(409));
  await assert.rejects(() => store.setEnabled(owner, view.version, true), status(409));
  const tested = await store.test(owner, view.version);
  assert.equal(tested.success, true); assert.equal(tested.config.testedVersion, '1');
  await assert.rejects(() => store.test(owner, view.version), status(429));
  view = await store.setEnabled(owner, view.version, true);
  assert.equal(view.enabled, true);
  assert.equal((await store.resolve(owner, view.version)).apiKey, secret);
  const beforeUnchangedSave = (await pool.query('SELECT * FROM library_private.smart_api_settings')).rows[0];
  const callsBeforeUnchangedSave = testCalls;
  const sameSettings = { ...view.settings, name: ` ${view.settings.name} `, baseUrl: 'https://MODELS.example.com/v1/', model: ` ${view.settings.model} ` };
  const unchangedSave = await store.save(owner, { version: view.version, settings: sameSettings });
  assert.deepEqual(unchangedSave, view, 'Normalized unchanged settings retain the enabled/tested version and timestamps.');
  assert.deepEqual((await pool.query('SELECT * FROM library_private.smart_api_settings')).rows[0], beforeUnchangedSave, 'A no-op cannot rewrite credentials, throttle or lease state.');
  assert.equal(testCalls, callsBeforeUnchangedSave);
  await assert.rejects(() => store.save(owner, { version: '0', settings: sameSettings }), status(409), 'A stale unchanged save still requires version validation.');
  await assert.rejects(() => store.save('not-owner', { version: view.version, settings: sameSettings }), status(403));
  const beforeExplicitKeyVersion = view.version;
  view = await store.save(owner, { version: view.version, settings: view.settings, apiKey: secret });
  assert.notEqual(view.version, beforeExplicitKeyVersion, 'Even the same explicit key is a new credential replacement intent.');
  assert.equal(view.enabled, false); assert.equal(view.testedVersion, null); assert.equal(view.hasKey, true);
  now += 61_000;
  await store.test(owner, view.version);
  view = await store.setEnabled(owner, view.version, true);
  const oldVersion = view.version;
  view = await store.save(owner, { version: view.version, settings: { ...settings, model: 'another-fixture-model' } });
  assert.equal(view.hasKey, true); assert.equal(view.enabled, false); assert.equal(view.testedVersion, null);
  await assert.rejects(() => store.resolve(owner, oldVersion), status(409));
  view = await store.save(owner, { version: view.version, settings: { ...settings, baseUrl: 'https://new.example.com/v1' } });
  assert.equal(view.hasKey, false, 'Changing target without a replacement must clear old credentials');
  await assert.rejects(() => store.test(owner, view.version), status(409));
  view = await store.save(owner, { version: view.version, settings, apiKey: secret });
  now += 61_000;
  let hookBefore = 0; let hookAfter = 0;
  await store.test(owner, view.version, { beforeSend: async meta => { hookBefore++; assert(!JSON.stringify(meta).includes(secret)); }, afterResult: async (_meta, outcome) => { hookAfter++; assert.equal(outcome.success, true); } });
  assert.equal(hookBefore, 1); assert.equal(hookAfter, 1);
  view = await store.clearKey(owner, view.version);
  assert.equal(view.hasKey, false); assert.equal(view.enabled, false);

  // The configuration remains independently migratable before the analysis tables exist.
  // Once those tables are present, changing/stopping a service must durably pause its jobs.
  await pool.query('CREATE TABLE library_private.analysis_jobs (id text PRIMARY KEY, owner_id text, state jsonb, revision bigint DEFAULT 1, updated_at timestamptz DEFAULT now())');
  await pool.query('CREATE TABLE library_private.analysis_requests (id text PRIMARY KEY, owner_id text, status text, lease_until timestamptz)');
  await pool.query("INSERT INTO library_private.analysis_jobs(id,owner_id,state) VALUES ('job-1',$1,'{\"status\":\"running\",\"targets\":[]}')", [owner]);
  view = await store.save(owner, { version: view.version, settings, apiKey: secret });
  let jobState = (await pool.query("SELECT state FROM library_private.analysis_jobs WHERE id='job-1'")).rows[0].state;
  assert.equal(jobState.status, 'paused');
  assert.deepEqual(jobState.targets, []);
  now += 61_000;
  await pool.query("INSERT INTO library_private.analysis_requests(id,owner_id,status,lease_until) VALUES ('request-1',$1,'sent',$2)", [owner, new Date(now + 60_000).toISOString()]);
  await assert.rejects(() => store.test(owner, view.version), status(429));
  await pool.query("UPDATE library_private.analysis_requests SET status='succeeded'");
  await store.test(owner, view.version);
  await store.setEnabled(owner, view.version, true);
  await pool.query("UPDATE library_private.analysis_jobs SET state='{\"status\":\"queued\",\"targets\":[]}'");
  const queuedBeforeNoop = (await pool.query("SELECT * FROM library_private.analysis_jobs WHERE id='job-1'")).rows[0];
  const enabledBeforeNoop = await store.read(owner);
  assert.deepEqual(await store.save(owner, { version: enabledBeforeNoop.version, settings: enabledBeforeNoop.settings }), enabledBeforeNoop);
  assert.deepEqual((await pool.query("SELECT * FROM library_private.analysis_jobs WHERE id='job-1'")).rows[0], queuedBeforeNoop, 'An unchanged save must not pause or revise approved analysis jobs.');
  await store.setEnabled(owner, view.version, false);
  await store.setEnabled(owner, view.version, true);
  jobState = (await pool.query("SELECT state FROM library_private.analysis_jobs WHERE id='job-1'")).rows[0].state;
  assert.equal(jobState.status, 'paused', 'Briefly switching off then on cannot silently resume already-approved jobs');

  let entered;
  const didEnter = new Promise(resolve => { entered = resolve; });
  let releaseModel;
  const gate = new Promise(resolve => { releaseModel = resolve; });
  const delayedStore = createApiConfigStore(pool, () => owner, {
    encryptionKey: () => masterKey, now: () => new Date(now),
    complete: async (config, items, beforeSend) => { await beforeSend?.(); entered(); await gate; return fakeModel(config, items); },
  });
  now += 61_000;
  const pendingTest = delayedStore.test(owner, view.version);
  await didEnter;
  now += 31_000;
  await assert.rejects(() => store.test(owner, view.version), status(429), 'A second test cannot bypass an in-flight lease after the minimum interval');
  view = await store.save(owner, { version: view.version, settings: { ...settings, model: 'changed-during-test' } });
  releaseModel();
  await assert.rejects(() => pendingTest, status(409));
  assert.equal((await store.read(owner)).testedVersion, null, 'Old test responses never enable a new destination/model version');
  await pool.query('CREATE ROLE smart_api_public_test');
  await pool.query('SET ROLE smart_api_public_test');
  await assert.rejects(() => pool.query('SELECT encrypted_key FROM library_private.smart_api_settings'), error => error.code === '42501');
  await pool.query('RESET ROLE');
  console.log('[smart-api] Encryption binding, SSRF/IP pinning, redirect/response limits, model schema, redacted settings, versioned tests, throttling and private SQL access passed.');
} finally { await db.close(); }
