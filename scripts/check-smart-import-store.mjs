import assert from "node:assert/strict";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { PGlite } from "@electric-sql/pglite";
import { createPglitePool } from "./lib/pglite-pool.mjs";
import { createTsLoader } from "./lib/load-ts.mjs";

// Deliberately no DATABASE_URL or environment-file support. Every fixture lives in memory.
const db = new PGlite(), pool = createPglitePool(db), load = createTsLoader();
const { createCloudLibraryStore } = load("src/lib/cloud-library.ts");
const { createSmartImportStore } = load("src/lib/server/smart-import-store.ts");
const { importJsonbBytes } = load("src/lib/smart-import-domain.ts");
const { getLegacyPublicResources } = load("src/lib/public-resources.ts");
const owner = "smart-import-fixture-owner", cloud = createCloudLibraryStore(pool, () => owner), store = createSmartImportStore(pool, () => owner);
const status = expected => error => error?.status === expected;
let seq = 0;
const requestId = () => `request-${++seq}`;
const handle = input => store.handle(input, owner);
const get = batchId => handle({ action: "get", batchId, filters: { view: "all" } });
const create = content => handle({ action: "create", requestId: requestId(), name: "Isolated fixture", format: "lines", content });
const cloudWrite = async input => { const current = await cloud.handle({ action: "list" }, owner); return cloud.handle({ ...input, libraryRevision: current.libraryRevision }, owner); };
const batchWrite = async (batchId, input) => { const current = await get(batchId); return handle({ batchId, batchRevision: current.batchRevision, ...input }); };
const preview = async (batchId, groupIds) => batchWrite(batchId, { action: "commit-preview", groupIds });
const commit = (batchId, prepared, id = requestId()) => handle({ action: "commit", batchId, batchRevision: prepared.batchRevision, libraryRevision: prepared.libraryRevision, groupIds: prepared.groupIds, confirmation: prepared.confirmation, requestId: id });

try {
  for (const migration of ["library-001.sql", "library-002-imports.sql"]) await db.exec(fs.readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
  const byteFixture = { text: "中🙂\ntext", tags: ["one", "二"], nested: { empty: [], yes: true }, zero: 0 };
  assert.equal(importJsonbBytes(byteFixture), (await db.query("SELECT octet_length($1::jsonb::text)::int AS bytes", [JSON.stringify(byteFixture)])).rows[0].bytes);
  const template = getLegacyPublicResources()[0];
  const baseline = { version: 1, publishedAt: "", resources: [
    { ...template, id: "old-resource", url: "https://old.example.com/article", name: "Existing archive", featured: false },
    { ...template, id: "published-only", url: "https://public-only.example.com/article", name: "Published only", featured: false },
  ] };
  const initialize = await cloud.initializationPreview(baseline, owner);
  await cloud.initialize(baseline, owner, initialize.confirmation);
  const initial = await cloud.handle({ action: "list" }, owner);
  await cloudWrite({ action: "save", resource: { ...initial.resources[0], status: "archived", visibility: "private" } });
  const backup = (await cloud.handle({ action: "backup" }, owner)).data;
  backup.resources = backup.resources.filter(resource => resource.id !== "published-only");
  const restore = await cloud.restorePreview(backup, owner);
  await cloud.restore(backup, owner, restore.libraryRevision, restore.confirmation);

  const content = ["https://new.example.com/article", "https://new.example.com/article?utm_source=x", "https://old.example.com/article", "https://public-only.example.com/article", "javascript:bad", "https://safe.example.com/doc", "https://safe.example.com/?token=private", "http://localhost/private"].join("\n");
  const created = await create(content), batchId = created.batch.id;
  assert.equal(created.batch.summary.rawTotal, 8);
  assert.equal(created.batch.summary.groupTotal, 6);
  assert.equal(created.batch.summary.duplicateSources, 1);
  assert.equal(created.batch.summary.invalidSources, 1);
  assert.equal((await create(content)).batch.id, batchId, "Unfinished identical uploads resume persisted decisions.");
  await assert.rejects(() => store.handle({ action: "get", batchId }, "another-owner"), status(403));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM library_private.import_sources WHERE batch_id=$1", [batchId])).rows[0].n, 8);
  let page = await get(batchId);
  assert.equal(page.pageSize, 50);
  assert(page.groups.some(group => group.matchKind === "archived"));
  assert(page.groups.some(group => group.matchKind === "published-only"));
  const fresh = page.groups.find(group => group.representative.url === "https://new.example.com/article");
  const detail = await handle({ action: "group", batchId, groupId: fresh.id });
  assert.equal(detail.sources.length, 2);
  assert.equal(detail.group.sourceCount, 2);
  await batchWrite(batchId, { action: "representative", groupId: fresh.id, sourceId: detail.sources[1].id });
  page = await get(batchId);
  assert.equal(page.groups.find(group => group.id === fresh.id).representativeId, detail.sources[1].id);
  await batchWrite(batchId, { action: "decide", groupIds: [fresh.id], decision: "ignore" });
  assert.equal((await get(batchId)).groups.find(group => group.id === fresh.id).decision, "ignore");
  await batchWrite(batchId, { action: "decide", groupIds: [fresh.id], decision: "keep", fields: { category: "开发与技术", kind: "article", description: "Confirmed by owner" } });
  page = await get(batchId);
  const currentRevision = page.batchRevision;
  const competing = await Promise.allSettled(["keep", "defer"].map(decision => handle({ action: "decide", batchId, batchRevision: currentRevision, groupIds: [fresh.id], decision })));
  assert.equal(competing.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(competing.filter(result => result.status === "rejected" && result.reason.status === 409).length, 1);

  page = await get(batchId);
  const capture = await store.claimTargets({ batchId, batchRevision: page.batchRevision, groupIds: page.groups.map(group => group.id) }, owner);
  assert(capture.excluded.some(item => page.groups.find(group => group.id === item.id).representative.url.includes("token=")));
  assert(capture.excluded.some(item => page.groups.find(group => group.id === item.id).representative.url.includes("localhost")));
  assert(capture.targets.every(target => Object.keys(target).sort().join(",") === "domain,groupRevision,id,title"));
  const target = capture.targets.find(target => target.id === fresh.id);
  await batchWrite(batchId, { action: "decide", groupIds: [fresh.id], fields: { category: "写作与知识" } });
  const revalidated = await store.revalidateTargets({ batchId, targets: [target] }, owner);
  assert.equal(revalidated.targets.length, 0);
  const applied = await store.applySuggestions({ batchId, results: [{ id: target.id, groupRevision: target.groupRevision, suggestion: { kind: "website", category: "AI 与自动化", tags: [], description: "", reason: "Fixture", confidence: "clear", source: "model" } }] }, owner);
  assert.equal(applied.appliedIds.length, 0, "Late model output cannot overwrite a human edit.");
  assert.equal((await get(batchId)).groups.find(group => group.id === fresh.id).fields.category, "写作与知识");
  const adoptedDirect = await batchWrite(batchId, { action: "decide", groupIds: [fresh.id], adoptSuggestion: true });
  const keptDirect = await handle({ action: "decide", batchId, batchRevision: adoptedDirect.batchRevision, groupIds: [fresh.id], decision: "keep" });
  assert.equal((await get(batchId)).batchRevision, keptDirect.batchRevision, "Decide responds with the committed revision, and reads do not advance it.");
  const directPreviewInput = { action: "commit-preview", batchId, batchRevision: keptDirect.batchRevision, groupIds: [fresh.id] };
  const previewTwice = await Promise.all([handle(directPreviewInput), handle(directPreviewInput)]);
  assert.equal(previewTwice[0].batchRevision, keptDirect.batchRevision);
  assert.equal(previewTwice[1].batchRevision, keptDirect.batchRevision);
  assert.equal(previewTwice[0].confirmation, previewTwice[1].confirmation, "Repeated mount/effect previews must have the same confirmation without writing progress.");
  await batchWrite(batchId, { action: "decide", groupIds: [fresh.id], fields: { category: "写作与知识" } });
  await db.exec(fs.readFileSync(new URL("../migrations/library-004-analysis.sql", import.meta.url), "utf8"));
  const currentTargetPage = await get(batchId);
  const currentTarget = (await store.claimTargets({ batchId, batchRevision: currentTargetPage.batchRevision, groupIds: [fresh.id] }, owner)).targets[0];
  await db.query("INSERT INTO library_private.analysis_jobs(id,owner_id,batch_id,request_id,state) VALUES($1,$2,$3,$4,$5::jsonb)", ["cancelled-job", owner, batchId, "analysis-fixture", JSON.stringify({ status: "cancelled" })]);
  const cancelled = await store.applySuggestions({ batchId, analysisJobId: "cancelled-job", results: [{ id: currentTarget.id, groupRevision: currentTarget.groupRevision, suggestion: { kind: "website", category: "AI 与自动化", tags: [], description: "", reason: "Cancelled fixture", confidence: "clear", source: "model" } }] }, owner);
  assert.equal(cancelled.appliedIds.length, 0);
  assert.equal(cancelled.batchRevision, currentTargetPage.batchRevision, "A cancelled analysis cannot advance or mutate the batch.");
  await db.query("UPDATE library_private.analysis_jobs SET state=$1::jsonb WHERE id=$2", [JSON.stringify({ status: "running" }), "cancelled-job"]);
  const cancelClient = await pool.connect();
  await cancelClient.query("BEGIN");
  await cancelClient.query("SELECT owner_id FROM library_private.state WHERE singleton=true FOR UPDATE");
  await cancelClient.query("UPDATE library_private.analysis_jobs SET state=$1::jsonb WHERE id=$2", [JSON.stringify({ status: "cancelled" }), "cancelled-job"]);
  const racingApply = store.applySuggestions({ batchId, analysisJobId: "cancelled-job", results: [{ id: currentTarget.id, groupRevision: currentTarget.groupRevision, suggestion: { kind: "website", category: "AI 与自动化", tags: [], description: "", reason: "Racing fixture", confidence: "clear", source: "model" } }] }, owner);
  await cancelClient.query("COMMIT"); cancelClient.release();
  assert.equal((await racingApply).appliedIds.length, 0, "A cancellation holding the shared state lock wins before a queued result can write.");

  page = await get(batchId);
  const ids = page.groups.filter(group => [fresh.id, page.groups.find(group => group.matchKind === "archived").id, page.groups.find(group => group.matchKind === "published-only").id].includes(group.id)).map(group => group.id);
  let prepared = await preview(batchId, ids);
  const archivePlan = prepared.items.find(item => item.disposition === "skip-existing");
  assert(archivePlan);
  const frozen = prepared.items.find(item => item.groupId === fresh.id).planHash;
  await batchWrite(batchId, { action: "decide", groupIds: [fresh.id], decision: "keep" });
  prepared = await preview(batchId, ids);
  assert.equal(prepared.items.find(item => item.groupId === fresh.id).planHash, frozen, "Defer/keep alone does not change a confirmed write proposal.");
  const idempotency = requestId(), result = await commit(batchId, prepared, idempotency);
  assert.equal(result.receipt.items.filter(item => item.status === "created").length, 2);
  assert.equal(result.receipt.items.filter(item => item.status === "skipped").length, 1);
  const replayed = await commit(batchId, prepared, idempotency);
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.libraryRevision, result.libraryRevision);
  await assert.rejects(() => handle({ action: "commit", batchId, groupIds: [fresh.id], batchRevision: prepared.batchRevision, libraryRevision: prepared.libraryRevision, confirmation: prepared.confirmation, requestId: idempotency }), status(409));
  const listing = await cloud.handle({ action: "list" }, owner);
  const added = listing.resources.find(resource => resource.id === result.receipt.items.find(item => item.groupId === fresh.id).resourceId);
  assert.equal(added.visibility, "private"); assert.equal(added.status, "organized"); assert.equal(added.category, "写作与知识");
  assert.equal(added.featured, false); assert.equal(added.pinned, false); assert.equal(added.usedByVitamin, false);
  assert.deepEqual((await db.query("SELECT snapshot FROM library_public.snapshot")).rows[0].snapshot, baseline);
  await assert.rejects(() => batchWrite(batchId, { action: "edit-source", sourceId: detail.sources[0].id, changes: { name: "Must not edit imported origin" } }), status(409));
  await assert.rejects(() => cloudWrite({ action: "undo-import", batchId }), status(409));

  const undoBeforeEdit = await batchWrite(batchId, { action: "undo-preview" });
  assert(undoBeforeEdit.items.some(item => item.resourceId === added.id && item.disposition === "eligible"));
  await cloudWrite({ action: "save", resource: { ...added, notes: "Preserve this manual edit" } });
  let undo = await batchWrite(batchId, { action: "undo-preview" });
  assert(undo.items.some(item => item.resourceId === added.id && item.disposition === "edited"));
  assert(!undo.defaultGroupIds.includes(fresh.id));
  const editedResource = (await cloud.handle({ action: "list" }, owner)).resources.find(resource => resource.id === added.id);
  await cloudWrite({ action: "save", resource: { ...editedResource, visibility: "public", status: "organized" } });
  const pubPreview = await cloud.handle({ action: "publish-preview" }, owner);
  await cloudWrite({ action: "publish", revision: pubPreview.revision });
  const marker = (await db.query("SELECT first_published_at FROM library_private.import_groups WHERE batch_id=$1 AND id=$2", [batchId, fresh.id])).rows[0];
  assert(marker.first_published_at);
  await cloudWrite({ action: "save", resource: { ...(await cloud.handle({ action: "list" }, owner)).resources.find(resource => resource.id === added.id), visibility: "private" } });
  const unpublish = await cloud.handle({ action: "publish-preview" }, owner); await cloudWrite({ action: "publish", revision: unpublish.revision });
  // Reintroducing an old private backup cannot erase the independent historical publication marker.
  const oldBackup = (await cloud.handle({ action: "backup" }, owner)).data;
  oldBackup.resources[oldBackup.resources.findIndex(resource => resource.id === added.id)] = added;
  const oldRestore = await cloud.restorePreview(oldBackup, owner); await cloud.restore(oldBackup, owner, oldRestore.libraryRevision, oldRestore.confirmation);
  undo = await batchWrite(batchId, { action: "undo-preview" });
  assert.equal(undo.items.find(item => item.resourceId === added.id).disposition, "protected");
  const undone = await handle({ action: "undo", batchId, groupIds: undo.defaultGroupIds, batchRevision: undo.batchRevision, libraryRevision: undo.libraryRevision, confirmation: undo.confirmation, requestId: requestId() });
  assert.equal(undone.receipt.items.filter(item => item.status === "undone").length, 1);
  assert((await cloud.handle({ action: "list" }, owner)).resources.some(resource => resource.id === added.id));

  const missingBatch = await create("https://old.example.com/article"), missingPage = await get(missingBatch.batch.id), missingGroup = missingPage.groups[0];
  const replacement = (await cloud.handle({ action: "backup" }, owner)).data; replacement.resources = replacement.resources.filter(resource => resource.id !== "old-resource");
  const replacementPlan = await cloud.restorePreview(replacement, owner); await cloud.restore(replacement, owner, replacementPlan.libraryRevision, replacementPlan.confirmation);
  const projectedDuplicates = await handle({ action: "get", batchId: missingBatch.batch.id, filters: { view: "duplicates" } });
  const selectedDuplicates = await handle({ action: "select", batchId: missingBatch.batch.id, batchRevision: projectedDuplicates.batchRevision, filters: { view: "duplicates" } });
  assert.deepEqual(selectedDuplicates.groupIds, projectedDuplicates.groups.filter(group => !group.readOnly).map(group => group.id), "Select must use the same current match projection as get after an external library change.");
  assert.equal(selectedDuplicates.total, projectedDuplicates.total);
  assert.equal(selectedDuplicates.batchRevision, missingPage.batchRevision, "Read-only projection and selection must not advance the batch revision.");
  assert.equal((await preview(missingBatch.batch.id, [missingGroup.id])).items[0].disposition, "needs-review");
  assert.equal((await get(missingBatch.batch.id)).groups[0].reviewRequired, true);
  await batchWrite(missingBatch.batch.id, { action: "decide", groupIds: [missingGroup.id], decision: "keep" });
  assert.equal((await preview(missingBatch.batch.id, [missingGroup.id])).items[0].disposition, "create");

  const resolutionBatch = await create("https://old.example.com/different");
  const resolutionPage = await get(resolutionBatch.batch.id), resolutionGroup = resolutionPage.groups[0];
  const currentAdded = (await cloud.handle({ action: "list" }, owner)).resources.find(resource => resource.id === added.id);
  await cloudWrite({ action: "save", resource: { ...currentAdded, status: "archived" } });
  let resolutionPreview = await batchWrite(resolutionBatch.batch.id, { action: "resolve-preview", groupId: resolutionGroup.id, resourceId: added.id, mode: "restore" });
  const restored = await handle({ action: "resolve", batchId: resolutionBatch.batch.id, groupId: resolutionGroup.id, resourceId: added.id, mode: "restore", batchRevision: resolutionPreview.batchRevision, libraryRevision: resolutionPreview.libraryRevision, confirmation: resolutionPreview.confirmation, requestId: requestId() });
  assert.equal(restored.receipt.items[0].status, "restored");
  assert.equal((await batchWrite(resolutionBatch.batch.id, { action: "undo-preview" })).items.length, 0, "Restoring an existing resource is not a batch-created resource.");
  const mergeBatch = await create("https://merge.example.com/article"), mergePage = await get(mergeBatch.batch.id), mergeGroup = mergePage.groups[0];
  const beforeMerge = (await cloud.handle({ action: "list" }, owner)).resources.find(resource => resource.id === added.id);
  resolutionPreview = await batchWrite(mergeBatch.batch.id, { action: "resolve-preview", groupId: mergeGroup.id, resourceId: added.id, mode: "merge", fields: { name: "Explicit merged name" } });
  await handle({ action: "resolve", batchId: mergeBatch.batch.id, groupId: mergeGroup.id, resourceId: added.id, mode: "merge", fields: { name: "Explicit merged name" }, batchRevision: resolutionPreview.batchRevision, libraryRevision: resolutionPreview.libraryRevision, confirmation: resolutionPreview.confirmation, requestId: requestId() });
  const merged = (await cloud.handle({ action: "list" }, owner)).resources.find(resource => resource.id === added.id);
  assert.equal(merged.name, "Explicit merged name"); assert.equal(merged.notes, beforeMerge.notes); assert.equal(merged.visibility, beforeMerge.visibility);
  assert((await db.query("SELECT data->'existingChange' AS change FROM library_private.import_groups WHERE batch_id=$1", [mergeBatch.batch.id])).rows[0].change.before);

  // Force a transaction failure after the draft update; its resources and receipt must roll back together.
  const rollbackBatch = await create("https://rollback.example.com/article"), rollbackPage = await get(rollbackBatch.batch.id);
  const rollbackPreview = await preview(rollbackBatch.batch.id, [rollbackPage.groups[0].id]);
  const beforeRollback = await cloud.handle({ action: "backup" }, owner);
  await db.exec("ALTER TABLE library_private.import_receipts ADD CONSTRAINT injected_receipt_failure CHECK (request_id <> 'force-failure')");
  await assert.rejects(() => commit(rollbackBatch.batch.id, rollbackPreview, "force-failure"));
  assert.deepEqual(await cloud.handle({ action: "backup" }, owner), beforeRollback);
  assert.equal((await get(rollbackBatch.batch.id)).groups[0].outcome, null);
  await db.exec("ALTER TABLE library_private.import_receipts DROP CONSTRAINT injected_receipt_failure");
  await commit(rollbackBatch.batch.id, rollbackPreview, "force-failure");

  const raceA = await create("https://race.example.com/article"), raceB = await create("https://race.example.com/article?utm_source=another-file");
  const raceAPage = await get(raceA.batch.id), raceBPage = await get(raceB.batch.id);
  const raceAPreview = await preview(raceA.batch.id, [raceAPage.groups[0].id]), raceBPreview = await preview(raceB.batch.id, [raceBPage.groups[0].id]);
  const racingCommits = await Promise.allSettled([commit(raceA.batch.id, raceAPreview), commit(raceB.batch.id, raceBPreview)]);
  assert.equal(racingCommits.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(racingCommits.filter(result => result.status === "rejected" && result.reason.status === 409).length, 1);
  const loser = racingCommits[0].status === "rejected" ? raceA.batch.id : raceB.batch.id;
  const loserPage = await get(loser), loserPreview = await preview(loser, [loserPage.groups[0].id]);
  assert.equal(loserPreview.items[0].disposition, "skip-existing");
  await commit(loser, loserPreview);
  assert.equal((await cloud.handle({ action: "list" }, owner)).resources.filter(resource => resource.url.startsWith("https://race.example.com/article")).length, 1);

  const regroupBatch = await create("https://regroup.example.com/a\nhttps://regroup.example.com/b"), regroupPage = await get(regroupBatch.batch.id);
  await batchWrite(regroupBatch.batch.id, { action: "decide", groupIds: [regroupPage.groups[0].id], decision: "keep" });
  await batchWrite(regroupBatch.batch.id, { action: "decide", groupIds: [regroupPage.groups[1].id], decision: "ignore" });
  await batchWrite(regroupBatch.batch.id, { action: "edit-source", sourceId: regroupPage.groups[1].representativeId, changes: { url: "https://regroup.example.com/a" } });
  const mergedGroups = await get(regroupBatch.batch.id);
  assert.equal(mergedGroups.groups.length, 1); assert.equal(mergedGroups.groups[0].reviewRequired, true); assert.equal(mergedGroups.groups[0].decision, "defer");
  const originsAfterMerge = await handle({ action: "group", batchId: regroupBatch.batch.id, groupId: mergedGroups.groups[0].id });
  assert.deepEqual(new Set(originsAfterMerge.sources.map(source => source.id)), new Set(regroupPage.groups.map(group => group.representativeId)));
  await batchWrite(regroupBatch.batch.id, { action: "decide", groupIds: [mergedGroups.groups[0].id], decision: "keep" });
  await batchWrite(regroupBatch.batch.id, { action: "edit-source", sourceId: mergedGroups.groups[0].representativeId, changes: { excluded: true } });
  const excludedSources = await handle({ action: "get", batchId: regroupBatch.batch.id, filters: { view: "excluded" } });
  assert.equal(excludedSources.invalidSources.length, 1);
  await batchWrite(regroupBatch.batch.id, { action: "edit-source", sourceId: excludedSources.invalidSources[0].id, changes: { excluded: false } });
  assert.equal((await get(regroupBatch.batch.id)).groups[0].sourceCount, 2);

  // Real SQL ACL, independently of a read-only transaction setting.
  await db.exec("CREATE ROLE smart_import_public_test; GRANT USAGE ON SCHEMA library_public TO smart_import_public_test; GRANT SELECT ON library_public.snapshot TO smart_import_public_test; SET ROLE smart_import_public_test;");
  for (const table of ["import_batches", "import_sources", "import_groups", "import_receipts"]) await assert.rejects(() => db.query(`SELECT * FROM library_private.${table}`), error => error.code === "42501");
  await db.exec("RESET ROLE");

  const memorySamples = [process.memoryUsage().rss], start = performance.now();
  const large = await create(Array.from({ length: 5000 }, (_, index) => `https://large.example.com/item/${index}`).join("\n"));
  const stagedMs = Math.round(performance.now() - start);
  memorySamples.push(process.memoryUsage().rss);
  const largePage = await get(large.batch.id); assert.equal(largePage.total, 5000); assert.equal(largePage.groups.length, 50);
  const selected = await handle({ action: "select", batchId: large.batch.id, batchRevision: largePage.batchRevision, filters: { view: "all", domain: "large.example.com" } });
  assert.equal(selected.groupIds.length, 5000);
  const largePreview = await preview(large.batch.id, selected.groupIds.slice(0, 100));
  const repeatedLargePreview = await handle({ action: "commit-preview", batchId: large.batch.id, batchRevision: largePreview.batchRevision, groupIds: largePreview.groupIds });
  assert.equal(repeatedLargePreview.confirmation, largePreview.confirmation);
  const commitStart = performance.now(); await commit(large.batch.id, largePreview); const commitMs = Math.round(performance.now() - commitStart);
  assert.equal((await get(large.batch.id)).batch.summary.createdResources, 100);
  const currentLibrary = await cloud.handle({ action: "list" }, owner);
  const filler = { ...currentLibrary.resources[0], importBatchId: "", visibility: "private", featured: false };
  const nearLimit = { version: 1, publishedAt: "", resources: Array.from({ length: 19950 }, (_, index) => ({ ...filler, id: `capacity-${index}`, name: `Capacity ${index}`, url: `https://capacity.example.com/${index}` })) };
  await db.query("UPDATE library_private.state SET state=$1::jsonb,revision=revision+1 WHERE singleton=true", [JSON.stringify(nearLimit)]);
  const capacityStart = performance.now();
  const capacityPreview = await preview(large.batch.id, selected.groupIds.slice(100, 200));
  const capacityResult = await commit(large.batch.id, capacityPreview);
  const capacityMs = Math.round(performance.now() - capacityStart);
  assert.equal(capacityResult.receipt.items.filter(item => item.status === "created").length, 50);
  assert.equal(capacityResult.receipt.items.filter(item => item.status === "failed").length, 50);
  assert.equal((await cloud.handle({ action: "list" }, owner)).resources.length, 20000);
  const allPreviewStart = performance.now();
  const allPreview = await preview(large.batch.id, selected.groupIds);
  const allPreviewMs = Math.round(performance.now() - allPreviewStart);
  memorySamples.push(process.memoryUsage().rss);
  assert.equal(allPreview.items.length, 5000);
  // JSONB adds formatting spaces, so count the database representation rather than compact JSON alone.
  const maxBytes = 32 * 1024 * 1024, byteLibrary = { version: 1, publishedAt: "", resources: [] };
  let bytes = importJsonbBytes(byteLibrary);
  for (let index = 0; index < 4000; index++) {
    const candidate = { ...filler, id: `byte-capacity-${index}`, url: `https://byte-capacity.example.com/${index}`, notes: "n".repeat(10000) };
    const separator = byteLibrary.resources.length ? 2 : 0, size = importJsonbBytes(candidate) + separator;
    if (bytes + size > maxBytes - 1000) {
      const available = maxBytes - 1000 - bytes - separator - (size - separator - 10000);
      if (available >= 0) { candidate.notes = "n".repeat(available); byteLibrary.resources.push(candidate); bytes += importJsonbBytes(candidate) + separator; }
      break;
    }
    byteLibrary.resources.push(candidate); bytes += size;
  }
  await db.query("UPDATE library_private.state SET state=$1::jsonb,revision=revision+1 WHERE singleton=true", [JSON.stringify(byteLibrary)]);
  const bytePreview = await preview(large.batch.id, selected.groupIds.slice(200, 300));
  const byteResult = await commit(large.batch.id, bytePreview);
  const byteCreated = byteResult.receipt.items.filter(item => item.status === "created").length;
  assert(byteCreated > 0 && byteCreated < 100);
  assert.equal(byteResult.receipt.items.filter(item => item.status === "failed").length, 100 - byteCreated);
  assert((await db.query("SELECT octet_length(state::text)::int AS bytes FROM library_private.state")).rows[0].bytes <= maxBytes);
  memorySamples.push(process.memoryUsage().rss);
  console.log(`PASS: isolated PGlite owner/ACL, resumable staging, revisions/receipts, private commit, cancellation/manual edit precedence, merge/restore, rollback, protected undo. 5000 staged ${stagedMs} ms; 100 commit ${commitMs} ms; 19950 capacity preview+commit ${capacityMs} ms; 5000-group/20000-library preview ${allPreviewMs} ms; sampled test-process RSS ${Math.round(Math.max(...memorySamples) / 1048576)} MiB (includes in-process PostgreSQL, not a production estimate).`);
} finally { await db.close(); }
