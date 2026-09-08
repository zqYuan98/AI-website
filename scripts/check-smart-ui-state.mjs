/** Pure UI decisions use fictional configuration and counts, with no browser, database or network. */
import assert from 'node:assert/strict';
import { createTsLoader } from './lib/load-ts.mjs';

const load = createTsLoader();
const { analysisOverview, usesCurrentConnection } = load('src/components/resources/smart-analysis-state.ts');
const { settingsPhase, settingsAreDirty, settingsReturnTo } = load('src/components/resources/smart-settings-state.ts');
const { SMART_API_DEFAULT_SETTINGS } = load('src/lib/smart-api-types.ts');
const config = { id: 'primary', version: '11', enabled: true, hasKey: true, encryptionReady: true, testedVersion: '11', settings: structuredClone(SMART_API_DEFAULT_SETTINGS) };
const makeJob = (id, state = {}) => ({ id, status: 'paused', config: { id: 'primary', version: '11', name: '虚构连接', model: 'fixture' }, succeeded: 0, pending: 0, ignored: 0, failed: 0, ...state });
const oldFailed = makeJob('old-failed', { config: { ...config, version: '1' }, failed: 60, ignored: 18 });
const oldSuccess = makeJob('old-success', { config: { ...config, version: '1' }, status: 'completed', succeeded: 5 });

assert.equal(usesCurrentConnection(oldFailed, config), false, 'Changing connection version must not offer an old job as the current model’s result.');
assert.equal(usesCurrentConnection(makeJob('same-version-other-id', { config: { id: 'another', version: '11' } }), config), false);
assert.equal(usesCurrentConnection(makeJob('current'), null), false);
assert.equal(usesCurrentConnection(makeJob('disabled'), { ...config, enabled: false }), true, 'Connection identity and permission to resume are different decisions.');
let overview = analysisOverview([oldFailed], config);
assert.equal(overview.latest, undefined); assert.equal(overview.active, undefined); assert.equal(overview.hasSuggestions, false);
assert.deepEqual(overview.history, [oldFailed], 'Failed and ignored counts cannot be described as saved AI suggestions.');
overview = analysisOverview([oldSuccess, oldFailed], config);
assert.equal(overview.latest, undefined); assert.equal(overview.hasSuggestions, true, 'Previously saved suggestions remain discoverable after changing provider.');
const currentDone = makeJob('current-done', { status: 'completed', succeeded: 3 });
const currentActive = makeJob('current-running', { status: 'running', pending: 4 });
const oldActive = makeJob('old-running', { config: { ...config, version: '1' }, status: 'running', pending: 1 });
const ordered = [oldActive, currentDone, currentActive, oldSuccess, oldFailed], before = structuredClone(ordered);
overview = analysisOverview(ordered, config);
assert.equal(overview.active.id, oldActive.id, 'An old connection’s live task still prevents accidental overlapping preparation.');
assert.equal(overview.latest.id, currentActive.id, 'Current active progress takes priority over a more recently updated completed record.');
assert.deepEqual(overview.history.map(job => job.id), [oldActive.id, currentDone.id, oldSuccess.id, oldFailed.id]);
assert.deepEqual(ordered, before, 'Deriving the overview must not reorder or mutate server records.');
assert.equal(analysisOverview([currentDone, oldSuccess], config).latest.id, currentDone.id);
assert.equal(analysisOverview([oldActive], null).active.id, oldActive.id);
assert.equal(analysisOverview([], config).hasSuggestions, false);

const phase = (input = {}) => settingsPhase({ config, loading: false, dirty: false, stopped: false, testFailed: false, ...input });
assert.equal(phase({ loading: true, config: null, dirty: true }), 'loading');
assert.equal(phase({ config: null }), 'load-error');
assert.equal(phase({ config: { ...config, encryptionReady: false }, dirty: true }), 'unavailable');
assert.equal(phase({ dirty: true, statusUnknown: true, testFailed: true }), 'draft', 'Unsaved edits must not be presented as tested or enabled.');
assert.equal(phase({ statusUnknown: true }), 'status-unknown', 'A failed refresh cannot keep presenting stale enabled state as ready.');
assert.equal(phase({ statusUnknown: true, testFailed: true }), 'status-unknown');
assert.equal(phase({ config: { ...config, hasKey: false, enabled: false, testedVersion: null }, testFailed: true }), 'unconfigured');
assert.equal(phase({ testFailed: true }), 'test-failed');
assert.equal(phase({ config: { ...config, testedVersion: '10' } }), 'needs-test');
assert.equal(phase({ config: { ...config, enabled: false } }), 'tested');
assert.equal(phase({ config: { ...config, enabled: false }, stopped: true }), 'stopped');
assert.equal(phase({ stopped: true }), 'ready', 'Confirmed server enablement takes priority over an obsolete local stopped flag.');
assert.equal(settingsAreDirty(config, structuredClone(config.settings), ' \t\n'), false, 'An empty replacement key must not force another save or invalidate a tested configuration.');
assert.equal(settingsAreDirty(config, { ...config.settings, model: 'new-fixture-model' }, ''), true);
assert.equal(settingsAreDirty(config, config.settings, 'new-fixture-key'), true);
assert.equal(settingsAreDirty(null, config.settings, 'new-fixture-key'), false, 'A missing configuration is a load state, not an editable loaded snapshot.');

const base = '/tools/manage/imports', batch = `${base}/smart-12345678-1234-4abc-8def-123456789abc`;
assert.equal(settingsReturnTo(base), base); assert.equal(settingsReturnTo(batch), batch); assert.equal(settingsReturnTo([batch]), batch);
for (const value of [null, undefined, '', [], [batch, batch], [batch, base],
  'https://outside.example/path', '//outside.example/path', '/\\outside.example/path',
  `${batch}/`, `${batch}?next=https://outside.example`, `${batch}#fragment`, `${batch}\n`, ` ${batch}`,
  `${base}/../settings`, batch.replace('-4abc-', '-1abc-'), batch.replace('-8def-', '-7def-'),
  encodeURIComponent(batch), batch.replace('/smart-', '/%73mart-'), '/tools/manage/settings']) {
  assert.equal(settingsReturnTo(value), base, 'Only the exact local imports list or a valid batch route is an allowed return destination.');
}
// Next search params are already URL-decoded once; the helper must not perform another decoding pass.
assert.equal(settingsReturnTo(new URLSearchParams({ returnTo: batch }).getAll('returnTo')), batch);
assert.equal(settingsReturnTo(new URLSearchParams(`returnTo=${encodeURIComponent(batch)}&returnTo=${encodeURIComponent(batch)}`).getAll('returnTo')), base);
assert.equal(settingsReturnTo(new URLSearchParams({ returnTo: encodeURIComponent(batch) }).getAll('returnTo')), base);
console.log('[smart-ui-state] Connection identity, real result counts, settings flow and safe return destinations passed.');
