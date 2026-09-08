/** Persistent analysis contract tests against PostgreSQL, with fictional data and no network. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from './lib/pglite-pool.mjs';
import { createTsLoader } from './lib/load-ts.mjs';

const db = new PGlite();
const pool = createPglitePool(db);
const owner = 'analysis-test-owner';
const load = createTsLoader();
const { createSmartAnalysisStore } = load('src/lib/server/smart-analysis-store.ts');
const { LibraryInputError } = load('src/lib/library-domain.ts');
const { SMART_API_DEFAULT_SETTINGS } = load('src/lib/smart-api-types.ts');
let config;
const candidates = new Map();
const statuses = new Map();
let sends = 0;
let active = 0;
let peak = 0;
let sendEffect;
let beforeSendEffect;
const context = batchId => ({ batch: { id: batchId, status: statuses.get(batchId) ?? 'reviewing' }, batchRevision: '1', libraryRevision: '1' });
function capture(batchId, targets) {
  const all = candidates.get(batchId);
  if (!all) throw new LibraryInputError('批次不存在。', 404);
  const result = [], excluded = [];
  for (const input of targets) {
    const found = all.find(t => t.id === input.id);
    if (found && (input.groupRevision === undefined || input.groupRevision === found.groupRevision)) result.push({ ...found });
    else excluded.push({ id: input.id, reason: '条目已修改。' });
  }
  return { ...context(batchId), targets: result, excluded };
}
const deps = {
  readConfig: async () => structuredClone(config),
  checkPublicTargets: async targets => ({ targets, excluded: [] }),
  capture: async (input) => capture(input.batchId, input.groupIds.map(id => ({ id }))),
  revalidate: async input => capture(input.batchId, input.targets),
  assertConfig: async (client, id, version) => {
    const result = await client.query('SELECT * FROM library_private.smart_api_settings WHERE owner_id=$1 FOR UPDATE', [id]);
    const current = result.rows[0];
    if (!current || String(current.version) !== version || !current.enabled || String(current.tested_version) !== version) throw new LibraryInputError('模型配置已变化。', 409);
  },
  apply: async (input) => {
    const valid = capture(input.batchId, input.results.map(r => ({ id: r.id, groupRevision: r.groupRevision })));
    for (const target of valid.targets) candidates.get(input.batchId).find(t => t.id === target.id).groupRevision = String(Number(target.groupRevision) + 1);
    return { ...context(input.batchId), appliedIds: valid.targets.map(t => t.id), ignored: valid.excluded };
  },
  send: async (_owner, version, targets, beforeSend) => {
    assert.equal(version, config.version, 'No silent provider/configuration switch');
    if (beforeSendEffect) await beforeSendEffect(targets);
    await beforeSend();
    sends++; active++; peak = Math.max(peak, active);
    try {
      assert(targets.every(t => !Object.hasOwn(t, 'notes') && !Object.hasOwn(t, 'url')));
      await new Promise(resolve => setTimeout(resolve, 8));
      if (sendEffect) await sendEffect(targets);
      return {
        suggestions: targets.map(t => ({ id: t.id, kind: 'website', category: '开发与技术', tags: ['文档'], description: '虚构用途说明', reason: '根据标题与域名', confidence: 'review', source: 'model' })),
        usage: { inputTokens: 100, outputTokens: 80 },
      };
    } finally { active--; }
  },
};
const store = createSmartAnalysisStore(pool, () => owner, deps);
async function setConfig(settings = {}, enabled = true) {
  const version = String(Number(config?.version ?? '0') + 1);
  config = { id: 'primary', version, testedVersion: version, enabled, hasKey: true, encryptionReady: true, settings: { ...SMART_API_DEFAULT_SETTINGS, baseUrl: 'https://model.example/v1', model: 'fictional-model', batchSize: 1, maxRequests: 100, concurrency: 2, ...settings }, testedAt: null, updatedAt: null };
  await pool.query("INSERT INTO library_private.smart_api_settings(owner_id,version,settings,encrypted_key,enabled,tested_version) VALUES($1,$2,$3::jsonb,'{}'::jsonb,$4,$2) ON CONFLICT(singleton) DO UPDATE SET version=$2,settings=$3::jsonb,enabled=$4,tested_version=$2,test_active_until=NULL", [owner, Number(version), JSON.stringify(config.settings), enabled]);
}
async function batch(count = 3) {
  const id = randomUUID();
  candidates.set(id, Array.from({ length: count }, (_, i) => ({ id: randomUUID(), title: `虚构文档 ${i}`, domain: 'example.com', groupRevision: '1' })));
  await pool.query("INSERT INTO library_private.import_batches(id,owner_id,fingerprint,create_request_id,metadata) VALUES($1,$2,$1,$1,'{}')", [id, owner]);
  for (const target of candidates.get(id)) await pool.query("INSERT INTO library_private.import_groups(batch_id,id,data) VALUES($1,$2,$3::jsonb)", [id, target.id, JSON.stringify({ revision: target.groupRevision, readOnly: false, decision: 'defer' })]);
  return id;
}
async function job(batchId, extra = {}) {
  const p = await store.preview({ batchId, batchRevision: '1', groupIds: candidates.get(batchId).map(t => t.id), configVersion: config.version }, owner);
  assert(p.targets.every(t => Object.keys(t).every(key => ['id', 'title', 'domain', 'groupRevision'].includes(key))));
  return { preview: p, requestId: randomUUID(), ...extra };
}
async function launch(batchId) {
  const prepared = await job(batchId);
  const result = await store.start({ confirmation: prepared.preview.confirmation, requestId: prepared.requestId }, owner);
  return { ...result, ...prepared };
}
async function drain(id) {
  for (let i = 0; i < 20; i++) {
    const result = await Promise.all([store.processNext(id), store.processNext(id), store.processNext(id)]);
    if (!result.some(r => r.more)) return (await store.get(id, owner)).job;
  }
  throw new Error('Fixture did not settle');
}
try {
  const { publicAnalysisTargets } = load('src/lib/server/smart-analysis-privacy.ts');
  const domainFixture = ['public.example.com', 'internal.example.com', 'mixed.example.com', 'unknown.example.com'];
  let lookups = 0;
  const checkedDomains = await publicAnalysisTargets(domainFixture.map((domain, index) => ({ id: String(index), title: '虚构标题', domain, groupRevision: '1' })), async domain => {
    lookups++;
    if (domain.startsWith('unknown')) throw new Error('DNS diagnostic must not escape');
    if (domain.startsWith('internal')) return [{ address: '10.0.0.4', family: 4 }];
    if (domain.startsWith('mixed')) return [{ address: '1.1.1.1', family: 4 }, { address: '192.168.1.1', family: 4 }];
    return [{ address: '1.1.1.1', family: 4 }];
  });
  assert.equal(lookups, 4);
  assert.deepEqual(checkedDomains.targets.map(t => t.id), ['0']);
  assert.equal(checkedDomains.excluded.length, 3);
  assert(!JSON.stringify(checkedDomains).includes('DNS diagnostic'));
  for (const name of ['library-001.sql', 'library-002-imports.sql', 'library-003-smart-api.sql', 'library-004-analysis.sql']) await db.exec(fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  await pool.query("INSERT INTO library_private.state(owner_id,state) VALUES($1,$2::jsonb)", [owner, JSON.stringify({ version: 1, resources: [], publishedAt: '' })]);
  await pool.query("INSERT INTO library_public.snapshot(snapshot) VALUES($1::jsonb)", [JSON.stringify({ version: 1, resources: [], publishedAt: '' })]);
  await setConfig();
  await setConfig({ batchSize: 25, maxRequests: 20 });
  const filteredBatch = await batch(1020), checkedTargetIds = [];
  candidates.get(filteredBatch).forEach((target, index) => { target.domain = index < 500 ? `private-${index}.example.com` : `public-${index}.example.com`; });
  const filteringStore = createSmartAnalysisStore(pool, () => owner, { ...deps, checkPublicTargets: async targets => {
    assert(targets.length <= 20, 'DNS validation uses bounded chunks rather than one unbounded request.');
    checkedTargetIds.push(...targets.map(target => target.id));
    return { targets: targets.filter(target => target.domain.startsWith('public-')), excluded: targets.filter(target => target.domain.startsWith('private-')).map(target => ({ id: target.id, reason: 'Fixture domain is private.' })) };
  } });
  const filteredPreview = await filteringStore.preview({ batchId: filteredBatch, batchRevision: '1', groupIds: candidates.get(filteredBatch).map(target => target.id), configVersion: config.version }, owner);
  assert.equal(filteredPreview.targets.length, 500, 'The first 500 private targets must not starve later sendable candidates.');
  assert.deepEqual(filteredPreview.targets.map(target => target.id), candidates.get(filteredBatch).slice(500, 1000).map(target => target.id));
  assert.equal(filteredPreview.excluded.length, 520);
  assert.equal(new Set([...filteredPreview.targets, ...filteredPreview.excluded].map(target => target.id)).size, 1020);
  assert.equal(checkedTargetIds.length, 1000, 'Stop resolving further domains as soon as the 500 public slots are filled.');
  assert.equal(filteredPreview.estimatedRequests, 20);
  assert(filteredPreview.excluded.slice(-20).every(target => target.reason.includes('限制')));
  const repeatedDomainBatch = await batch(525), checkedDomainsInPreview = [];
  candidates.get(repeatedDomainBatch).forEach((target, index) => { target.domain = index < 500 ? 'private-repeated.example.com' : 'public-repeated.example.com'; });
  const cachingStore = createSmartAnalysisStore(pool, () => owner, { ...deps, checkPublicTargets: async targets => {
    checkedDomainsInPreview.push(...targets.map(target => target.domain));
    return { targets: targets.filter(target => target.domain.startsWith('public-')), excluded: targets.filter(target => target.domain.startsWith('private-')).map(target => ({ id: target.id, reason: 'Fixture domain is private.' })) };
  } });
  const cachedPreview = await cachingStore.preview({ batchId: repeatedDomainBatch, batchRevision: '1', groupIds: candidates.get(repeatedDomainBatch).map(target => target.id), configVersion: config.version }, owner);
  assert.equal(cachedPreview.targets.length, 25);
  assert.deepEqual(checkedDomainsInPreview, ['private-repeated.example.com', 'public-repeated.example.com'], 'Same-domain candidates reuse only this preview’s DNS decision across chunks.');
  const realNow = Date.now, startedAt = realNow();
  let clockOffset = 0, budgetChecks = 0;
  const budgetStore = createSmartAnalysisStore(pool, () => owner, { ...deps, checkPublicTargets: async targets => {
    budgetChecks++; clockOffset += 21_000;
    return { targets: targets.slice(0, 1), excluded: targets.slice(1).map(target => ({ id: target.id, reason: 'Fixture unknown domain.' })) };
  } });
  try {
    Date.now = () => startedAt + clockOffset;
    const budgetPreview = await budgetStore.preview({ batchId: filteredBatch, batchRevision: '1', groupIds: candidates.get(filteredBatch).map(target => target.id), configVersion: config.version }, owner);
    assert.equal(budgetChecks, 1, 'A slow DNS batch must stop further checks after the preview time budget.');
    assert.equal(budgetPreview.targets.length, 1);
    assert.equal(budgetPreview.excluded.filter(target => target.reason.includes('时间上限')).length, 1000);
  } finally { Date.now = realNow; }
  await setConfig();
  const initialBatch = await batch();
  const initial = await launch(initialBatch);
  await assert.rejects(store.get(initial.job.id, 'visitor'), e => e.status === 403);
  await pool.query('DELETE FROM library_private.analysis_previews WHERE id=$1', [initial.preview.confirmation]);
  const replay = await store.start({ confirmation: initial.preview.confirmation, requestId: initial.requestId }, owner);
  assert.equal(replay.job.id, initial.job.id, 'Start receipt is idempotent');
  await assert.rejects(store.start({ confirmation: 'different-scope', requestId: initial.requestId }, owner), e => e.status === 409);
  await assert.rejects(launch(initialBatch), e => e.status === 409);
  const complete = await drain(initial.job.id);
  assert.equal(complete.succeeded, 3);
  assert.equal(complete.status, 'completed');
  assert.equal(peak, 2, 'Concurrent waves obey the shared configuration limit');
  assert.equal(complete.estimatedReservedCost, null, 'Unknown price is not presented as zero');

  const editedBatch = await batch(1);
  const edited = await launch(editedBatch);
  candidates.get(editedBatch)[0].groupRevision = '2';
  const beforeEdited = sends;
  const editedResult = await drain(edited.job.id);
  assert.equal(editedResult.ignored, 1);
  assert.equal(sends, beforeEdited, 'Changed candidates are excluded before sending');

  const lateBatch = await batch(1);
  const late = await launch(lateBatch);
  sendEffect = () => { candidates.get(lateBatch)[0].groupRevision = '2'; };
  assert.equal((await drain(late.job.id)).ignored, 1, 'Late suggestions never replace manual changes');
  sendEffect = undefined;

  const pauseBatch = await batch(1);
  const paused = await launch(pauseBatch);
  let pausedView = (await store.control({ action: 'pause', jobId: paused.job.id, revision: paused.job.revision }, owner)).job;
  const beforePause = sends;
  assert.equal((await store.processNext(pausedView.id)).more, false);
  assert.equal(sends, beforePause);
  pausedView = (await store.control({ action: 'resume', jobId: pausedView.id, revision: pausedView.revision }, owner)).job;
  assert.equal((await drain(pausedView.id)).succeeded, 1);

  const versionBatch = await batch(1);
  const versionJob = await launch(versionBatch);
  await setConfig({ baseUrl: 'https://another.example/v1' });
  const beforeVersion = sends;
  await store.processNext(versionJob.job.id);
  const versionView = (await store.get(versionJob.job.id, owner)).job;
  assert.equal(versionView.status, 'paused');
  assert.equal(sends, beforeVersion);
  await assert.rejects(store.control({ action: 'resume', jobId: versionView.id, revision: versionView.revision }, owner), e => e.status === 409);

  const failingBatch = await batch(1);
  const failing = await launch(failingBatch);
  sendEffect = () => { throw new Error('Bearer secret-synthetic-do-not-return'); };
  const failed = await drain(failing.job.id);
  assert.equal(failed.status, 'paused');
  assert.equal(failed.failed, 1);
  assert.equal(failed.possibleCharge, true);
  assert(!JSON.stringify(failed).includes('secret-synthetic'));
  const beforeRetry = sends;
  await store.processNext(failed.id);
  assert.equal(sends, beforeRetry, 'Ambiguous/failed provider calls do not retry automatically');
  sendEffect = undefined;
  await store.control({ action: 'resume', jobId: failed.id, revision: failed.revision, retryFailed: true }, owner);
  assert.equal((await drain(failed.id)).succeeded, 1);

  await setConfig({ inputPricePerMillion: 1, outputPricePerMillion: 1, estimatedBudget: 0.00001 });
  const capped = await launch(await batch(1));
  const beforeBudget = sends;
  assert.equal((await drain(capped.job.id)).status, 'paused');
  assert.equal(sends, beforeBudget, 'Budget reservation is checked before dispatch');

  await setConfig({ inputPricePerMillion: 1, outputPricePerMillion: 1, estimatedBudget: 0.02, concurrency: 3 });
  const concurrentBudget = await launch(await batch(3));
  const concurrentBudgetView = await drain(concurrentBudget.job.id);
  assert.equal(concurrentBudgetView.succeeded, 1, 'Other lanes do not cancel a request with an already reserved budget');
  assert.equal(concurrentBudgetView.status, 'paused');
  assert(concurrentBudgetView.estimatedReservedCost <= 0.02);

  await setConfig({ concurrency: 3, maxRequests: 1 });
  const requestCap = await launch(await batch(2));
  // Preview exposes the fixed one-request scope and leaves the remainder for another analysis.
  assert.equal(requestCap.preview.targets.length, 1); assert.equal(requestCap.preview.excluded.length, 1);
  assert.equal((await drain(requestCap.job.id)).requests, 1);

  await setConfig();
  const expiredBeforeSend = await launch(await batch(1));
  beforeSendEffect = async () => { await pool.query("UPDATE library_private.analysis_requests SET lease_until=now()-interval '1 second' WHERE job_id=$1", [expiredBeforeSend.job.id]); };
  const beforeExpired = sends;
  await store.processNext(expiredBeforeSend.job.id);
  assert.equal(sends, beforeExpired, 'A lease expiring during DNS/config resolution cannot dispatch');
  beforeSendEffect = undefined;

  const editedDuringDnsBatch = await batch(1);
  const editedDuringDns = await launch(editedDuringDnsBatch);
  beforeSendEffect = async () => { await pool.query("UPDATE library_private.import_groups SET data=jsonb_set(data,'{revision}','\"2\"'::jsonb) WHERE batch_id=$1", [editedDuringDnsBatch]); };
  const beforeDnsEdit = sends;
  await store.processNext(editedDuringDns.job.id);
  assert.equal(sends, beforeDnsEdit, 'Final transport guard catches a candidate edit during DNS');
  beforeSendEffect = undefined;

  const pausedDuringDnsBatch = await batch(1);
  const pausedDuringDns = await launch(pausedDuringDnsBatch);
  beforeSendEffect = async () => { await pool.query("UPDATE library_private.import_batches SET metadata='{" + '"status":"paused"' + "}'::jsonb WHERE id=$1", [pausedDuringDnsBatch]); };
  const beforeDnsPause = sends;
  await store.processNext(pausedDuringDns.job.id);
  assert.equal(sends, beforeDnsPause, 'Final transport guard catches a batch pause during DNS');
  beforeSendEffect = undefined;

  const disabledBeforeSend = await launch(await batch(1));
  beforeSendEffect = async () => { await setConfig({}, false); };
  const beforeDisabled = sends;
  await store.processNext(disabledBeforeSend.job.id);
  assert.equal(sends, beforeDisabled, 'Final transport guard catches a configuration change during preparation');
  beforeSendEffect = undefined;

  await setConfig({ concurrency: 1 });
  const testBusy = await launch(await batch(1));
  await pool.query("UPDATE library_private.smart_api_settings SET test_active_until=now()+interval '30 seconds'");
  const beforeTest = sends;
  assert.equal((await store.processNext(testBusy.job.id)).more, true);
  assert.equal(sends, beforeTest, 'A connection test shares the concurrency ceiling');
  await pool.query('UPDATE library_private.smart_api_settings SET test_active_until=NULL');
  assert.equal((await drain(testBusy.job.id)).succeeded, 1);

  const crashBatch = await batch(1);
  const crash = await launch(crashBatch);
  const stored = (await pool.query('SELECT state FROM library_private.analysis_jobs WHERE id=$1', [crash.job.id])).rows[0].state;
  const requestId = randomUUID();
  stored.targets[0].status = 'working'; stored.targets[0].requestId = requestId; stored.status = 'running'; stored.requests = 1;
  await pool.query('UPDATE library_private.analysis_jobs SET state=$1::jsonb WHERE id=$2', [JSON.stringify(stored), crash.job.id]);
  await pool.query("INSERT INTO library_private.analysis_requests(id,job_id,owner_id,config_version,status,target_ids,lease_until) VALUES($1,$2,$3,$4,'sent',$5::jsonb,now()-interval '1 second')", [requestId, crash.job.id, owner, config.version, JSON.stringify([stored.targets[0].id])]);
  const beforeCrash = sends;
  await store.processNext(crash.job.id);
  const recovered = (await store.get(crash.job.id, owner)).job;
  assert.equal(recovered.status, 'paused'); assert.equal(recovered.possibleCharge, true);
  assert.equal(sends, beforeCrash, 'Expired sent lease requires an explicit retry decision');

  const lostDispatch = await launch(await batch(1));
  const preserved = (await store.dispatchFailed(lostDispatch.job.id, owner)).job;
  assert.equal(preserved.status, 'paused'); assert.equal(preserved.pending, 1);
  await assert.rejects(store.control({ action: 'cancel', jobId: preserved.id, revision: '0' }, owner), e => e.status === 409);
  const cancelled = (await store.control({ action: 'cancel', jobId: preserved.id, revision: preserved.revision }, owner)).job;
  assert.equal((await store.processNext(cancelled.id)).more, false);

  assert.equal((await pool.query('SELECT state FROM library_private.state')).rows[0].state.resources.length, 0, 'Suggestions do not import');
  assert.equal((await pool.query('SELECT snapshot FROM library_public.snapshot')).rows[0].snapshot.resources.length, 0, 'Suggestions do not publish');
  await db.exec('CREATE ROLE analysis_public_fixture; SET ROLE analysis_public_fixture');
  await assert.rejects(db.query('SELECT * FROM library_private.analysis_jobs'), /permission denied/);
  await db.exec('RESET ROLE');
  await pool.query('DELETE FROM library_private.import_batches WHERE id=$1', [crashBatch]);
  assert.equal((await pool.query('SELECT id FROM library_private.analysis_jobs WHERE batch_id=$1', [crashBatch])).rows.length, 0);
  assert.equal((await store.processNext(crash.job.id)).more, false, 'Deleted batch terminates worker safely');
  console.log('[smart-analysis] Durable receipts, owner/ACL, caps, shared concurrency, manual precedence, cancellation, config binding and uncertain-result recovery passed.');
} finally { await db.close(); }
