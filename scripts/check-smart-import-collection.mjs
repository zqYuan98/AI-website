/** Collection lifecycle uses fictional data in an in-memory PostgreSQL engine. No env URLs or network. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from './lib/pglite-pool.mjs';
import { createTsLoader } from './lib/load-ts.mjs';

const db = new PGlite(), pool = createPglitePool(db), load = createTsLoader();
const { createSmartImportStore } = load('src/lib/server/smart-import-store.ts');
const { createCloudLibraryStore } = load('src/lib/cloud-library.ts');
const owner = 'collection-fixture-owner', store = createSmartImportStore(pool, () => owner), cloud = createCloudLibraryStore(pool, () => owner);
const handle = input => store.handle(input, owner), rejectStatus = code => error => error?.status === code;
const library = () => cloud.handle({ action: 'list' }, owner);
const cloudWrite = async input => cloud.handle({ ...input, libraryRevision: (await library()).libraryRevision }, owner);
const get = (batchId, filters) => handle({ action: 'get', batchId, ...(filters ? { filters } : {}) });
const detail = (batchId, groupId) => handle({ action: 'group', batchId, groupId });
const create = content => handle({ action: 'create', name: 'Fictional collection lifecycle', format: 'lines', content, requestId: randomUUID(), forceNew: true });
async function commitBatch(batchId) {
  const page = await get(batchId);
  const preview = await handle({ action: 'commit-preview', batchId, batchRevision: page.batchRevision, groupIds: page.groups.map(group => group.id) });
  return handle({ action: 'commit', batchId, batchRevision: preview.batchRevision, libraryRevision: preview.libraryRevision, groupIds: preview.groupIds, confirmation: preview.confirmation, requestId: randomUUID() });
}
async function operation(batchId, groupId, mode) {
  const page = await detail(batchId, groupId);
  return { action: 'collection', mode, batchId, groupId, expectedResourceId: page.group.outcome?.resourceId, batchRevision: page.batchRevision, libraryRevision: page.libraryRevision, requestId: randomUUID() };
}
async function resolve(mode, resourceId) {
  const batch = await create(`https://${mode}.example.com/independent-source`), page = await get(batch.batch.id), groupId = page.groups[0].id;
  const input = { batchId: batch.batch.id, groupId, resourceId, mode, ...(mode === 'merge' ? { fields: { description: 'Explicitly merged description' } } : {}) };
  const preview = await handle({ ...input, action: 'resolve-preview', batchRevision: page.batchRevision });
  await handle({ ...input, action: 'resolve', batchRevision: preview.batchRevision, libraryRevision: preview.libraryRevision, confirmation: preview.confirmation, requestId: randomUUID() });
  return { batchId: batch.batch.id, groupId };
}
async function assertLiveSummaries(associations, state) {
  const listed = await handle({ action: 'list' });
  for (const { batchId, groupId } of associations) {
    const page = await get(batchId), group = (await detail(batchId, groupId)).group;
    assert.equal(group.currentCollection.state, state);
    assert.equal(group.resultStatus, state === 'active' ? 'collected' : 'removed');
    assert.deepEqual(listed.batches.find(batch => batch.id === batchId).summary, page.batch.summary, 'List and detail must use one live collection projection, even for another batch’s association.');
    for (const resultStatus of ['ready', 'review', 'skipped', 'collected', 'removed']) assert.equal((await get(batchId, { resultStatus })).total, page.batch.summary.resultCounts[resultStatus]);
    assert.equal(Object.values(page.batch.summary.resultCounts).reduce((sum, count) => sum + count, 0), page.batch.summary.groupTotal);
  }
}

try {
  for (const migration of ['library-001.sql', 'library-002-imports.sql']) await db.exec(fs.readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  const baseline = { version: 1, publishedAt: '', resources: [] }, initialization = await cloud.initializationPreview(baseline, owner);
  await cloud.initialize(baseline, owner, initialization.confirmation);
  const created = await create('https://created.example.com/a\nhttps://created.example.com/a?utm_source=duplicate\nhttps://other.example.com/b');
  await commitBatch(created.batch.id);
  const createdPage = await get(created.batch.id), createdGroup = createdPage.groups.find(group => group.sourceCount === 2);
  const resourceId = createdGroup.outcome.resourceId, otherId = createdPage.groups.find(group => group.id !== createdGroup.id).outcome.resourceId;
  const primary = { batchId: created.batch.id, groupId: createdGroup.id };
  const linked = await resolve('link', resourceId), merged = await resolve('merge', resourceId);
  await cloudWrite({ action: 'bulk', ids: [resourceId], changes: { status: 'archived' } });
  const restored = await resolve('restore', resourceId), associations = [primary, linked, merged, restored];
  const beforeEdit = (await library()).resources.find(resource => resource.id === resourceId);
  await cloudWrite({ action: 'save', resource: { ...beforeEdit, name: 'Current owner title', url: 'https://edited.example.com/current', kind: 'asset', category: '设计与创作', description: 'Current owner description', tags: ['current-owner-tag'], notes: 'PRIVATE-COLLECTION-NOTE', pinned: true } });
  const edited = (await detail(primary.batchId, primary.groupId)).group;
  assert.equal(edited.fields.name, createdGroup.fields.name, 'Import history remains intact after a collection edit.');
  assert.equal(edited.currentCollection.resource.name, 'Current owner title');
  assert.equal(edited.currentCollection.resource.url, 'https://edited.example.com/current');
  assert.deepEqual(Object.keys(edited.currentCollection.resource).sort(), ['name', 'url', 'kind', 'category', 'description', 'tags'].sort());
  assert(!JSON.stringify(edited.currentCollection).includes('PRIVATE-COLLECTION-NOTE'));
  assert.equal((await get(primary.batchId, { resultStatus: 'collected', search: 'current owner description', category: '设计与创作', domain: 'edited.example.com' })).total, 1);
  await assertLiveSummaries(associations, 'active');

  const badAssociation = await operation(primary.batchId, primary.groupId, 'archive');
  await assert.rejects(store.handle(badAssociation, 'other-owner'), rejectStatus(403));
  await assert.rejects(handle({ ...badAssociation, expectedResourceId: otherId }), rejectStatus(409));
  await assert.rejects(handle({ ...badAssociation, groupId: linked.groupId }), rejectStatus(409));
  await assert.rejects(handle({ ...badAssociation, libraryRevision: undefined }), rejectStatus(428));
  await assert.rejects(handle({ ...badAssociation, batchRevision: undefined }), rejectStatus(428));
  await assert.rejects(handle({ ...badAssociation, mode: 'erase' }), rejectStatus(400));
  await assert.rejects(handle({ ...badAssociation, mode: 'restore' }), rejectStatus(409));
  await cloudWrite({ action: 'bulk', ids: [otherId], changes: { pinned: true } });
  await assert.rejects(handle(badAssociation), rejectStatus(409), 'Even unrelated library edits invalidate a displayed action snapshot.');
  const beforePause = await operation(primary.batchId, primary.groupId, 'archive');
  await handle({ action: 'pause', batchId: primary.batchId, batchRevision: beforePause.batchRevision });
  await assert.rejects(handle(beforePause), rejectStatus(409));

  const input = await operation(primary.batchId, primary.groupId, 'archive');
  const beforeRollback = await cloud.handle({ action: 'backup' }, owner);
  const beforeHistory = (await pool.query('SELECT data FROM library_private.import_groups WHERE batch_id=$1 AND id=$2', [primary.batchId, primary.groupId])).rows[0].data;
  await db.exec("ALTER TABLE library_private.import_receipts ADD CONSTRAINT collection_rollback CHECK (request_id <> 'collection-rollback')");
  await assert.rejects(handle({ ...input, requestId: 'collection-rollback' }));
  assert.deepEqual(await cloud.handle({ action: 'backup' }, owner), beforeRollback);
  assert.equal((await get(primary.batchId)).batchRevision, input.batchRevision);
  await db.exec('ALTER TABLE library_private.import_receipts DROP CONSTRAINT collection_rollback');
  const archived = await handle(input);
  assert.equal(archived.receipt.action, 'collection'); assert.equal(archived.receipt.items[0].status, 'archived');
  assert.equal(archived.batch.status, 'paused', 'Collection management also works while the import workflow is paused.');
  assert.equal(archived.batch.summary.resultCounts.collected, 1); assert.equal(archived.batch.summary.resultCounts.removed, 1);
  assert.equal(archived.batch.summary.createdResources, 2, 'The historical number created by this batch is not rewritten as a live count.');
  assert.equal(archived.batch.summary.skippedSources, 0);
  const replay = await handle(input); assert.equal(replay.replayed, true); assert.equal(replay.libraryRevision, archived.libraryRevision);
  await assert.rejects(handle({ ...input, expectedResourceId: otherId }), rejectStatus(409), 'A receipt cannot be reused for a different association.');
  await assert.rejects(handle(await operation(primary.batchId, primary.groupId, 'archive')), rejectStatus(409));
  await assertLiveSummaries(associations, 'archived');
  assert.deepEqual((await pool.query('SELECT data FROM library_private.import_groups WHERE batch_id=$1 AND id=$2', [primary.batchId, primary.groupId])).rows[0].data, beforeHistory, 'Archiving must not change outcome, readOnly, original fields or provenance.');
  assert.deepEqual((await handle({ action: 'select', batchId: primary.batchId, batchRevision: archived.batchRevision, filters: { resultStatus: 'removed' } })).groupIds, []);
  await handle({ action: 'cancel', batchId: primary.batchId, batchRevision: archived.batchRevision });
  const restoredCollection = await handle(await operation(primary.batchId, primary.groupId, 'restore'));
  assert.equal(restoredCollection.batch.status, 'cancelled', 'Restoration must not resume the cancelled import workflow.');
  const current = (await library()).resources.find(resource => resource.id === resourceId);
  assert.equal(current.status, 'organized'); assert.equal(current.visibility, 'private'); assert.equal(current.featured, false);
  assert.equal(current.notes, 'PRIVATE-COLLECTION-NOTE'); assert.equal(current.pinned, true);
  assert.equal((await handle(input)).replayed, true);
  assert.equal((await library()).resources.find(resource => resource.id === resourceId).status, 'organized', 'Replaying an old archive receipt cannot undo a later restoration.');
  await assertLiveSummaries(associations, 'active');

  const racing = await operation(linked.batchId, linked.groupId, 'archive');
  const race = await Promise.allSettled([handle(racing), handle({ ...racing, requestId: randomUUID() })]);
  assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(race.find(result => result.status === 'rejected').reason.status, 409);
  await handle(await operation(merged.batchId, merged.groupId, 'restore'));
  await cloudWrite({ action: 'save', resource: { id: resourceId, visibility: 'public', status: 'organized', recommendation: 'Fictional recommendation', featured: true } });
  const publicPlan = await cloud.handle({ action: 'publish-preview' }, owner); await cloudWrite({ action: 'publish', revision: publicPlan.revision });
  const published = (await pool.query('SELECT snapshot FROM library_public.snapshot')).rows[0].snapshot;
  assert.equal((await detail(primary.batchId, primary.groupId)).group.currentCollection.publishedInSnapshot, true);
  await handle(await operation(primary.batchId, primary.groupId, 'archive'));
  const publicArchive = (await detail(primary.batchId, primary.groupId)).group;
  assert.equal(publicArchive.currentCollection.publishedInSnapshot, true); assert.equal(publicArchive.currentCollection.state, 'archived');
  assert.deepEqual((await pool.query('SELECT snapshot FROM library_public.snapshot')).rows[0].snapshot, published);
  await handle(await operation(restored.batchId, restored.groupId, 'restore'));
  assert.deepEqual((await pool.query('SELECT snapshot FROM library_public.snapshot')).rows[0].snapshot, published);
  assert.equal((await library()).resources.find(resource => resource.id === resourceId).visibility, 'private');
  assert.equal((await library()).resources.find(resource => resource.id === resourceId).featured, false);

  const skipped = await create('https://edited.example.com/current'); await commitBatch(skipped.batch.id);
  const skippedGroup = (await get(skipped.batch.id)).groups[0];
  assert.equal(skippedGroup.outcome.kind, 'skipped'); assert.equal(skippedGroup.currentCollection, null); assert.equal(skippedGroup.resultStatus, 'skipped');
  await assert.rejects(handle(await operation(skipped.batch.id, skippedGroup.id, 'archive')), rejectStatus(409));
  const unfinished = await create('https://uncollected.example.com/new'), unfinishedGroup = (await get(unfinished.batch.id)).groups[0];
  await assert.rejects(handle({ ...(await operation(unfinished.batch.id, unfinishedGroup.id, 'archive')), expectedResourceId: resourceId }), rejectStatus(409));
  const toUndo = await create('https://undo.example.com/fresh'); await commitBatch(toUndo.batch.id);
  const undoPage = await get(toUndo.batch.id), undo = await handle({ action: 'undo-preview', batchId: toUndo.batch.id, batchRevision: undoPage.batchRevision });
  await handle({ action: 'undo', batchId: toUndo.batch.id, batchRevision: undo.batchRevision, libraryRevision: undo.libraryRevision, confirmation: undo.confirmation, groupIds: undo.defaultGroupIds, requestId: randomUUID() });
  const undone = (await get(toUndo.batch.id)).groups[0]; assert.equal(undone.currentCollection, null); assert.equal(undone.resultStatus, 'skipped');
  await assert.rejects(handle(await operation(toUndo.batch.id, undone.id, 'restore')), rejectStatus(409));

  const backup = (await cloud.handle({ action: 'backup' }, owner)).data;
  backup.resources = backup.resources.filter(resource => resource.id !== resourceId);
  const replacement = await cloud.restorePreview(backup, owner); await cloud.restore(backup, owner, replacement.libraryRevision, replacement.confirmation);
  await cloudWrite({ action: 'save', resource: { name: 'Same URL, unrelated new identity', url: 'https://edited.example.com/current' } });
  await assertLiveSummaries(associations, 'missing');
  const missing = (await detail(primary.batchId, primary.groupId)).group;
  assert.equal(missing.currentCollection.resourceId, resourceId); assert.equal(missing.currentCollection.resource, null); assert.equal(missing.currentCollection.publishedInSnapshot, true);
  for (const mode of ['archive', 'restore']) await assert.rejects(handle(await operation(primary.batchId, primary.groupId, mode)), rejectStatus(409), 'A matching URL with a different ID must never replace the missing association.');
  const readRevision = (await get(primary.batchId)).batchRevision;
  await handle({ action: 'list' }); await detail(primary.batchId, primary.groupId); await get(primary.batchId);
  assert.equal((await get(primary.batchId)).batchRevision, readRevision, 'Current-state reads must not persist projections or advance batch revisions.');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM library_private.import_groups WHERE data ? 'currentCollection'")).rows[0].n, 0);
  assert.deepEqual((await pool.query('SELECT snapshot FROM library_public.snapshot')).rows[0].snapshot, published);
  console.log('[smart-import-collection] Owner/revision/association guards, current fields/counts, shared archives, private restoration, receipts, rollback and unchanged publication passed.');
} finally { await db.close(); }
