/** Private import/settings/analysis routes share this real boundary; no live account is used. */
import assert from 'node:assert/strict';
import { createTsLoader } from './lib/load-ts.mjs';

const savedOrigin = process.env.BETTER_AUTH_URL;
const origin = 'https://owner.example';
let enabled = true;
let session = null;
let calls = 0;
let authReads = 0;
let failure;
const moduleOverrides = {
  './config': { cloudLibraryEnabled: () => enabled },
  './auth': { getOwnerSession: async () => { authReads++; return session; } },
};
const load = createTsLoader(process.cwd(), moduleOverrides);
const { ownerJsonPost, privateUnsupportedMethod } = load('src/lib/server/owner-json-api.ts');
const { LibraryInputError } = load('src/lib/library-domain.ts');
const POST = ownerJsonPost(async (input, owner) => {
  assert.equal(owner, 'only-owner');
  calls++;
  if (failure) throw failure;
  return { received: input.action, owner };
});
function request(body = { action: 'list' }, headers = {}) {
  return new Request(`${origin}/api/library/imports`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
async function status(req, expected) {
  const response = await POST(req);
  assert.equal(response.status, expected);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('vary'), 'Cookie');
  return response;
}

async function checkActualRoutes() {
  const ownerId = 'only-owner';
  const secretSentinel = 'SYNTHETIC-KEY-NEVER-IN-RESPONSES';
  const privateTitle = 'SYNTHETIC-PRIVATE-BOOKMARK-TITLE';
  const serviceCalls = [];
  const workflowStarts = [];
  const persistedPauses = [];
  let factories = 0;
  let serviceFailure;
  let dispatchFailure;
  let pauseFailure;
  let analysisJob = { id: 'opaque-analysis-job', status: 'queued', revision: '1' };
  const settingsView = { id: 'primary', version: '3', testedVersion: '3', hasKey: true, enabled: false };
  const workflowMarker = () => { assert.fail('The route must hand the workflow to start, never execute it directly'); };
  function called(service, method, args) {
    serviceCalls.push({ service, method, args });
    if (serviceFailure) throw serviceFailure;
  }
  const settingsMethod = method => async (...args) => {
    called('settings', method, args);
    return method === 'test' ? { config: settingsView, success: true, requestId: 'opaque-test-request', usage: null } : settingsView;
  };
  const services = {
    imports: { handle: async (...args) => {
      called('imports', 'handle', args);
      return { batch: { id: 'opaque-import-batch' }, saved: true };
    } },
    settings: Object.fromEntries(['read', 'save', 'test', 'setEnabled', 'clearKey'].map(method => [method, settingsMethod(method)])),
    analysis: {
      handle: async (...args) => {
        called('analysis', 'handle', args);
        return { job: { ...analysisJob } };
      },
      dispatchFailed: async (jobId, principal) => {
        persistedPauses.push({ jobId, ownerId: principal });
        if (pauseFailure) throw pauseFailure;
        assert.equal(jobId, analysisJob.id);
        assert.equal(principal, ownerId);
        analysisJob = { ...analysisJob, status: 'paused', revision: String(Number(analysisJob.revision) + 1), message: '后台任务暂时未能启动，已保留发送范围。' };
        return { job: { ...analysisJob } };
      },
    },
  };
  // Keep the real owner-json-api module and its cached LibraryInputError identity.
  // Only application services and the external workflow dispatcher are replaced.
  moduleOverrides['@/lib/server/smart-services'] = { smartServices: () => { factories++; return services; } };
  moduleOverrides['@/workflows/smart-analysis'] = { smartAnalysisWorkflow: workflowMarker };
  moduleOverrides['workflow/api'] = { start: async (workflow, args) => {
    assert.equal(workflow, workflowMarker);
    workflowStarts.push([...args]);
    if (dispatchFailure) throw dispatchFailure;
    return { runId: 'internal-workflow-run-not-a-route-result' };
  } };
  const routes = [
    { name: 'imports', route: load('src/app/api/library/imports/route.ts'), valid: { action: 'list', ownerId: 'spoofed-owner' } },
    { name: 'smart-settings', route: load('src/app/api/library/smart-settings/route.ts'), valid: { action: 'read', ownerId: 'spoofed-owner' } },
    { name: 'analysis', route: load('src/app/api/library/analysis/route.ts'), valid: { action: 'get', jobId: analysisJob.id, ownerId: 'spoofed-owner' } },
  ];
  function routeRequest(name, body, headers = {}) {
    return new Request(`${origin}/api/library/${name}`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }
  async function invoke(target, body = target.valid, expected = 200, headers = {}) {
    const response = await target.route.POST(routeRequest(target.name, body, headers));
    assert.equal(response.status, expected, `${target.name}: ${String(body?.action ?? 'body validation')}`);
    assert.match(response.headers.get('cache-control'), /private.*no-store/);
    assert.equal(response.headers.get('vary'), 'Cookie');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const text = await response.text();
    assert(!text.includes(secretSentinel), `${target.name} leaked a synthetic credential`);
    assert(!text.includes('database://'), `${target.name} leaked database diagnostics`);
    assert(!text.includes(privateTitle), `${target.name} leaked unapproved bookmark content`);
    return text ? JSON.parse(text) : null;
  }

  for (const target of routes) {
    const servicesBefore = serviceCalls.length;
    const factoriesBefore = factories;
    const startsBefore = workflowStarts.length;
    const authBefore = authReads;
    enabled = false;
    await invoke(target, target.valid, 404);
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']) assert.equal(target.route[method]().status, 404);
    enabled = true;
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']) {
      const response = target.route[method]();
      assert.equal(response.status, 405);
      assert.match(response.headers.get('cache-control'), /private.*no-store/);
    }
    await invoke(target, target.valid, 403, { origin: 'https://evil.example' });
    await invoke(target, target.valid, 403, { origin: '' });
    await invoke(target, target.valid, 403, { 'sec-fetch-site': 'cross-site' });
    assert.equal(authReads, authBefore, `${target.name} must reject mode/origin before looking up a session`);
    session = null;
    await invoke(target, target.valid, 401);
    session = { user: { id: ownerId } };
    await invoke(target, target.valid, 415, { 'content-type': 'text/plain' });
    await invoke(target, '[]', 400);
    await invoke(target, '{broken', 400);
    await invoke(target, target.valid, 413, { 'content-length': String(4 * 1024 * 1024 + 1) });
    await invoke(target, 'x'.repeat(4 * 1024 * 1024 + 1), 413);
    assert.equal(serviceCalls.length, servicesBefore, `${target.name} bypassed the owner/body boundary`);
    assert.equal(factories, factoriesBefore, `${target.name} initialized private services before authorization`);
    assert.equal(workflowStarts.length, startsBefore);

    await invoke(target);
    const successful = serviceCalls.at(-1);
    assert.equal(successful.service, target.name === 'smart-settings' ? 'settings' : target.name);
    if (target.name === 'smart-settings') assert.deepEqual(successful.args, [ownerId]);
    else assert.deepEqual(successful.args, [target.valid, ownerId], 'The session principal must win over a body ownerId');
    assert.equal(workflowStarts.length, startsBefore, 'A read/list route must never dispatch a workflow');

    serviceFailure = new LibraryInputError('版本已更新，请刷新后重试。', 409);
    assert.equal((await invoke(target, target.valid, 409)).error, '版本已更新，请刷新后重试。');
    serviceFailure = new Error(`Bearer ${secretSentinel} database://private ${privateTitle}`);
    await invoke(target, target.valid, 503);
    serviceFailure = undefined;
    assert.equal(workflowStarts.length, startsBefore);
  }

  const settings = routes.find(target => target.name === 'smart-settings');
  const savedInput = { action: 'save', version: '3', settings: { name: 'Synthetic provider', baseUrl: 'https://example.com/v1', model: 'fixture' }, apiKey: secretSentinel, ownerId: 'spoofed-owner' };
  await invoke(settings, savedInput);
  assert.deepEqual(serviceCalls.at(-1), { service: 'settings', method: 'save', args: [ownerId, savedInput] });
  const settingsCases = [
    [{ action: 'test', version: '3', items: [{ title: privateTitle }], apiKey: secretSentinel }, 'test', [ownerId, '3']],
    [{ action: 'clear-key', version: '3' }, 'clearKey', [ownerId, '3']],
    [{ action: 'set-enabled', version: '3', enabled: true }, 'setEnabled', [ownerId, '3', true]],
    [{ action: 'set-enabled', version: '3', enabled: false }, 'setEnabled', [ownerId, '3', false]],
  ];
  for (const [input, method, args] of settingsCases) {
    await invoke(settings, input);
    assert.deepEqual(serviceCalls.at(-1), { service: 'settings', method, args });
  }
  for (const input of [{ action: 'test' }, { action: 'clear-key', version: 3 }, { action: 'set-enabled', version: '3', enabled: 'true' }, { action: 'unknown', version: '3' }]) {
    const before = serviceCalls.length;
    await invoke(settings, input, 400);
    assert.equal(serviceCalls.length, before, 'Invalid settings commands must not invoke a storage or model method');
  }

  const analysis = routes.find(target => target.name === 'analysis');
  for (const action of ['start', 'resume']) {
    for (const state of ['queued', 'running', 'paused', 'completed', 'cancelled']) {
      analysisJob = { id: `opaque-${action}-${state}`, status: state, revision: '1' };
      const before = workflowStarts.length;
      const pausesBefore = persistedPauses.length;
      const input = { action, jobId: 'untrusted-body-job-id', confirmation: 'opaque-preview', ownerId: 'spoofed-owner', candidates: [{ title: privateTitle }] };
      const result = await invoke(analysis, input);
      assert.deepEqual(result, { job: analysisJob });
      assert.equal(workflowStarts.length, before + (state === 'queued' ? 1 : 0), `${action} must only dispatch a queued result`);
      assert.equal(persistedPauses.length, pausesBefore);
      if (state === 'queued') assert.deepEqual(workflowStarts.at(-1), [analysisJob.id], 'Workflow input is the stored opaque job ID, never request content, owner or credentials');
    }
  }
  for (const action of ['get', 'list', 'pause', 'cancel', 'preview']) {
    analysisJob = { id: 'opaque-read-job', status: 'queued', revision: '1' };
    const before = workflowStarts.length;
    await invoke(analysis, { action, jobId: analysisJob.id });
    assert.equal(workflowStarts.length, before, `${action} cannot dispatch even when a fixture result happens to be queued`);
  }

  for (const action of ['start', 'resume']) {
    analysisJob = { id: `opaque-failed-${action}`, status: 'queued', revision: '1' };
    dispatchFailure = new Error(`Workflow transport failed with ${secretSentinel} ${privateTitle}`);
    const before = workflowStarts.length;
    const pausesBefore = persistedPauses.length;
    const result = await invoke(analysis, { action, jobId: 'spoofed-body-job', ownerId: 'spoofed-owner' });
    assert.equal(workflowStarts.length, before + 1);
    assert.equal(persistedPauses.length, pausesBefore + 1, 'Dispatch failure must use the persistent store transition');
    assert.deepEqual(persistedPauses.at(-1), { jobId: analysisJob.id, ownerId });
    assert.equal(result.job.status, 'paused');
    assert.equal(result.job.revision, '2');
    assert.deepEqual(await invoke(analysis, { action: 'get', jobId: analysisJob.id }), result, 'A later read must observe the stored paused result');
  }

  analysisJob = { id: 'opaque-failed-pause', status: 'queued', revision: '1' };
  pauseFailure = new Error(`database://private/${secretSentinel}`);
  const startsBeforeFailure = workflowStarts.length;
  await invoke(analysis, { action: 'start' }, 503);
  assert.equal(workflowStarts.length, startsBeforeFailure + 1, 'A failed pause write cannot cause a second dispatch');
  pauseFailure = undefined;
  dispatchFailure = undefined;
  serviceFailure = new Error(`database://private/${secretSentinel}`);
  const startsBeforeStoreFailure = workflowStarts.length;
  await invoke(analysis, { action: 'start' }, 503);
  assert.equal(workflowStarts.length, startsBeforeStoreFailure, 'A failed store action must never launch a workflow');
}
try {
  process.env.BETTER_AUTH_URL = origin;
  enabled = false;
  await status(request(), 404);
  assert.equal(privateUnsupportedMethod().status, 404);
  enabled = true;
  assert.equal(privateUnsupportedMethod().status, 405);
  await status(request({}, { origin: 'https://evil.example' }), 403);
  await status(request({}, { origin: '' }), 403);
  await status(request({}, { 'sec-fetch-site': 'cross-site' }), 403);
  assert.equal(authReads, 0);
  await status(request(), 401);
  assert.equal(calls, 0);
  session = { user: { id: 'only-owner' } };
  await status(request({}, { 'content-type': 'text/plain' }), 415);
  await status(request('null'), 400);
  await status(request('[]'), 400);
  await status(request('{broken'), 400);
  await status(request({}, { 'content-length': String(5 * 1024 * 1024) }), 413);
  await status(request('x'.repeat(4 * 1024 * 1024 + 1)), 413);
  assert.equal(calls, 0);
  const ok = await status(request({ action: 'list', ownerId: 'attacker' }), 200);
  assert.equal((await ok.json()).owner, 'only-owner', 'Body cannot choose the principal');
  failure = new LibraryInputError('批次已更新，请刷新后核对。', 409);
  await status(request(), 409);
  failure = new Error('Bearer secret-key database://private');
  const unavailable = await status(request(), 503);
  assert(!JSON.stringify(await unavailable.json()).includes('secret-key'));
  await checkActualRoutes();
  console.log('[smart-routes] Real imports/settings/analysis routes: owner/Origin/body guards, command wiring, queued-only opaque workflow dispatch, persistent dispatch-failure pause and error redaction passed.');
} finally {
  if (savedOrigin === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = savedOrigin;
}
