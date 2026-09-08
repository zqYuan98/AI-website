import "server-only";
import { randomUUID } from "node:crypto";
import { getDatabasePool } from "./database";
import type { LibraryConnection, LibraryPool } from "../cloud-library";
import { LibraryInputError, MAX_RESOURCES, MAX_STORE_BYTES, normalizeLibraryState, normalizePublicSnapshot } from "../library-domain";
import { canonicalBookmarkUrl } from "../bookmark-import";
import { publicModelDomain } from "./smart-api-security";
import { checkedImportFields, editImportSource, filteredImportGroups, importFacets, importGroupDto, importHash, importIds, importJsonbBytes, importRecord, importRelationshipHash, importResult, importSummary, importText, parseImportSources, projectImportAcceptance, regroupImportSources, sourceDto, type ImportGroupRecord, type ImportSourceRecord } from "../smart-import-domain";
import type { LibraryResource, LibraryState, PublicLibrarySnapshot } from "../resource-types";
import type { SmartImportAnalysisCapture, SmartImportAnalysisTarget, SmartImportBatch, SmartImportBatchContext, SmartImportCommitItem, SmartImportFilters, SmartImportReceipt, SmartImportReceiptItem, SmartImportSuggestionMode, SmartImportSuggestionResult, SmartImportUndoItem } from "../smart-import-types";

type BatchRow = { id: string; owner_id: string; revision: string; metadata: Record<string, unknown>; created_at: Date | string; updated_at: Date | string };
type Context = { client: LibraryConnection; ownerId: string; state: LibraryState; publication: PublicLibrarySnapshot; libraryRevision: string; row: BatchRow; sources: ImportSourceRecord[]; groups: ImportGroupRecord[]; initialSources: Map<string, string>; initialGroups: Map<string, string>; urlIndex?: Map<string, LibraryResource[]> };
const iso = (value: Date | string) => new Date(value).toISOString();
const now = () => new Date().toISOString();
function configuredOwner() { return process.env.LIBRARY_OWNER_ID?.trim() ?? ""; }
function revision(value: unknown, actual: string) {
  if (value === undefined) throw new LibraryInputError("缺少版本，请刷新预览后重试。", 428);
  if (typeof value !== "string" || value !== actual || !/^[1-9]\d*$/.test(value)) throw new LibraryInputError("其他页面已修改资源或本批次；你的决定仍保留，请刷新后核对。", 409);
}
function requestId(value: unknown) { const id = importText(value, 100, true); if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new LibraryInputError("请求标识不正确。"); return id; }
function pageNumber(value: unknown) { if (value === undefined) return 1; if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 10000) throw new LibraryInputError("页码不正确。"); return Number(value); }
function batchDto(context: Context): SmartImportBatch {
  return { id: context.row.id, name: String(context.row.metadata.name), format: context.row.metadata.format as "html" | "lines", status: context.row.metadata.status as SmartImportBatch["status"], revision: context.row.revision, createdAt: iso(context.row.created_at), updatedAt: iso(context.row.updated_at), summary: importSummary(context.sources, context.groups) };
}
function response(context: Context): SmartImportBatchContext { return { batch: batchDto(context), batchRevision: context.row.revision, libraryRevision: context.libraryRevision }; }
function active(context: Context) { if (["paused", "cancelled"].includes(String(context.row.metadata.status))) throw new LibraryInputError("本批次已暂停或取消，请先继续。", 409); }
function groupsByIds(context: Context, value: unknown, max = 5000) {
  const ids = importIds(value, max), index = new Map(context.groups.map(group => [group.id, group]));
  return ids.map(id => { const group = index.get(id); if (!group) throw new LibraryInputError("部分分组已重新组合或不存在，请刷新后重新选择。", 409); return group; });
}
function updateIntent(context: Context, group: ImportGroupRecord) {
  for (const source of context.sources) if (source.groupId === group.id) source.intent = { decision: group.decision, fields: group.manualFields, categoryConfirmed: group.categoryConfirmed };
}
function filters(value: unknown): SmartImportFilters {
  if (value === undefined) return {};
  const input = importRecord(value);
  if (Object.keys(input).some(key => !["view", "resultStatus", "search", "folder", "domain", "kind", "category", "decision"].includes(key))) throw new LibraryInputError("筛选条件不正确。");
  for (const item of Object.values(input)) importText(item, 1000);
  if (input.view !== undefined && !["review", "suggested", "duplicates", "invalid", "excluded", "all"].includes(String(input.view))) throw new LibraryInputError("筛选视图不正确。");
  if (input.resultStatus !== undefined && !["ready", "review", "skipped", "collected"].includes(String(input.resultStatus))) throw new LibraryInputError("整理结果筛选不正确。");
  return input as SmartImportFilters;
}
function suggestionMode(value: unknown): SmartImportSuggestionMode {
  if (value === undefined || value === "preserve") return "preserve";
  if (value === "accept-preserving-manual") return value;
  throw new LibraryInputError("建议采纳方式不正确。");
}

export function createSmartImportStore(pool: LibraryPool, owner: () => string = configuredOwner) {
  function authorize(ownerId: string) { if (!ownerId || ownerId !== owner()) throw new LibraryInputError("无权访问此导入工作区。", 403); }
  async function transaction<T>(ownerId: string, work: (client: LibraryConnection) => Promise<T>) {
    authorize(ownerId);
    const client = await pool.connect();
    try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
    catch (error) { try { await client.query("ROLLBACK"); } catch { /* Never expose driver diagnostics. */ } throw error; }
    finally { client.release(); }
  }
  async function library(client: LibraryConnection, ownerId: string) {
    // The shared library lock always precedes a batch lock, including analysis result writes.
    const row = (await client.query("SELECT owner_id,state,revision::text AS revision FROM library_private.state WHERE singleton=true FOR UPDATE")).rows[0];
    if (!row || row.owner_id !== ownerId) throw new LibraryInputError("资源库尚未初始化或无权访问。", 403);
    const published = (await client.query("SELECT snapshot FROM library_public.snapshot WHERE singleton=true")).rows[0];
    if (!published) throw new LibraryInputError("公开快照尚未初始化。", 503);
    return { state: normalizeLibraryState(row.state), publication: normalizePublicSnapshot(published.snapshot), libraryRevision: String(row.revision) };
  }
  async function load(client: LibraryConnection, ownerId: string, batchId: unknown): Promise<Context> {
    const current = await library(client, ownerId);
    const row = (await client.query("SELECT id,owner_id,revision::text AS revision,metadata,created_at,updated_at FROM library_private.import_batches WHERE id=$1 AND owner_id=$2 FOR UPDATE", [importText(batchId, 100, true), ownerId])).rows[0] as BatchRow | undefined;
    if (!row) throw new LibraryInputError("导入批次不存在。", 404);
    const sourceRows = (await client.query("SELECT data FROM library_private.import_sources WHERE batch_id=$1 ORDER BY ordinal", [row.id])).rows;
    const groupRows = (await client.query("SELECT data,first_published_at FROM library_private.import_groups WHERE batch_id=$1", [row.id])).rows;
    const sources = sourceRows.map(item => item.data as ImportSourceRecord);
    const groups = groupRows.map(item => ({ ...(item.data as ImportGroupRecord), firstPublishedAt: item.first_published_at ? iso(item.first_published_at as Date) : null }));
    groups.sort((a, b) => a.representative.ordinal - b.representative.ordinal);
    return { ...current, client, ownerId, row, sources, groups, initialSources: new Map(sources.map(source => [source.id, importHash(source)])), initialGroups: new Map(groups.map(group => [group.id, importHash(group)])) };
  }
  async function persist(context: Context, libraryChanged = false) {
    if (libraryChanged) {
      if (context.state.resources.length > MAX_RESOURCES || importJsonbBytes(context.state) > MAX_STORE_BYTES) throw new LibraryInputError("资源库将超过 20000 条或 32 MB 限制。");
      context.state = normalizeLibraryState(context.state);
      context.libraryRevision = String((await context.client.query("UPDATE library_private.state SET state=$1::jsonb,revision=revision+1,updated_at=now() WHERE singleton=true AND owner_id=$2 RETURNING revision::text AS revision", [JSON.stringify(context.state), context.ownerId])).rows[0].revision);
    }
    const changedSources = context.sources.filter(source => context.initialSources.get(source.id) !== importHash(source));
    const changedGroups = context.groups.filter(group => context.initialGroups.get(group.id) !== importHash(group));
    if (changedSources.length) await context.client.query("INSERT INTO library_private.import_sources(batch_id,id,ordinal,data) SELECT $1,x.id,x.ordinal,x.data FROM jsonb_to_recordset($2::jsonb) AS x(id text,ordinal integer,data jsonb) ON CONFLICT(batch_id,id) DO UPDATE SET data=EXCLUDED.data", [context.row.id, JSON.stringify(changedSources.map(source => ({ id: source.id, ordinal: source.ordinal, data: source })))]);
    await context.client.query("DELETE FROM library_private.import_groups WHERE batch_id=$1 AND NOT(id=ANY($2::text[]))", [context.row.id, context.groups.map(group => group.id)]);
    if (changedGroups.length) await context.client.query("INSERT INTO library_private.import_groups(batch_id,id,data,created_resource_id,first_published_at) SELECT $1,x.id,x.data,x.resource_id,x.published_at FROM jsonb_to_recordset($2::jsonb) AS x(id text,data jsonb,resource_id text,published_at timestamptz) ON CONFLICT(batch_id,id) DO UPDATE SET data=EXCLUDED.data,created_resource_id=COALESCE(library_private.import_groups.created_resource_id,EXCLUDED.created_resource_id),first_published_at=COALESCE(library_private.import_groups.first_published_at,EXCLUDED.first_published_at)", [context.row.id, JSON.stringify(changedGroups.map(group => ({ id: group.id, data: group, resource_id: group.createdFingerprint ? group.outcome?.resourceId : null, published_at: group.firstPublishedAt ?? null })))]);
    const summary = importSummary(context.sources, context.groups);
    if (!["paused", "cancelled"].includes(String(context.row.metadata.status))) context.row.metadata.status = summary.pendingGroups + summary.failedGroups + summary.invalidSources === 0 ? "completed" : summary.createdResources ? "partial" : "reviewing";
    context.row.metadata.summary = summary;
    const row = (await context.client.query("UPDATE library_private.import_batches SET metadata=$1::jsonb,revision=revision+1,updated_at=now() WHERE id=$2 AND owner_id=$3 RETURNING revision::text AS revision,updated_at", [JSON.stringify(context.row.metadata), context.row.id, context.ownerId])).rows[0];
    context.row.revision = String(row.revision); context.row.updated_at = row.updated_at as Date;
  }
  function regroup(context: Context) { context.groups = regroupImportSources(context.sources, context.groups, context.state.resources, context.publication, context.row.id); }
  function plan(context: Context, group: ImportGroupRecord, mode: SmartImportSuggestionMode): SmartImportCommitItem {
    if (!context.urlIndex) {
      context.urlIndex = new Map();
      for (const resource of context.state.resources) { const key = canonicalBookmarkUrl(resource.url), entries = context.urlIndex.get(key); if (entries) entries.push(resource); else context.urlIndex.set(key, [resource]); }
    }
    const matches = context.urlIndex.get(group.canonical) ?? [];
    const missing = group.formerMatchIds.length > 0 && !group.formerMatchIds.some(id => matches.some(resource => resource.id === id));
    const accepting = mode === "accept-preserving-manual", result = accepting ? importResult(group) : null;
    const proposal = projectImportAcceptance(group, mode);
    const disposition = group.readOnly ? "already-completed" : group.decision === "ignore" ? "invalid" : group.reviewRequired || missing || result?.status === "review" ? "needs-review" : matches.length ? "skip-existing" : "create";
    const reason = disposition === "needs-review" ? result?.reasons.join("；") || "分组或原有匹配已变化，请确认后再入库" : disposition === "invalid" ? "本组已忽略，请先恢复" : matches.length ? "提交时复查：该网址已经在库中" : group.matchKind === "published-only" ? "此链接目前公开，确认后仅重新收为私有收藏" : null;
    return { groupId: group.id, name: proposal.fields.name, disposition, existingResourceId: matches[0]?.id ?? null, reason,
      ...(accepting ? { proposal } : {}),
      planHash: importHash({ disposition, fields: proposal.fields, categoryConfirmed: proposal.categoryConfirmed, url: group.representative.url, sourceFolder: group.representative.sourceFolder, createdAt: group.representative.createdAt, matches: matches.map(resource => ({ id: resource.id, url: resource.url, status: resource.status })),
        ...(accepting ? { suggestionMode: mode, proposal, relationships: importRelationshipHash(group) } : {}) }) };
  }
  function confirmation(context: Context, action: string, proposal: unknown) { return importHash({ batchId: context.row.id, batchRevision: context.row.revision, libraryRevision: context.libraryRevision, action, proposal }); }
  function checkConfirmation(input: Record<string, unknown>, expected: string) { if (input.confirmation !== expected) throw new LibraryInputError("预览已经变化，请重新核对。", 409); }
  async function replay(context: Context, input: Record<string, unknown>) {
    const id = requestId(input.requestId);
    const row = (await context.client.query("SELECT payload_hash,result FROM library_private.import_receipts WHERE batch_id=$1 AND request_id=$2", [context.row.id, id])).rows[0];
    const { batchRevision: _batch, libraryRevision: _library, confirmation: _confirmation, ...intent } = input;
    void _batch; void _library; void _confirmation;
    const payloadHash = importHash(intent);
    if (row && row.payload_hash !== payloadHash) throw new LibraryInputError("此请求标识已经用于另一项操作，请重新确认。", 409);
    return { id, payloadHash, receipt: row?.result as SmartImportReceipt | undefined };
  }
  async function receipt(context: Context, operation: Awaited<ReturnType<typeof replay>>, action: SmartImportReceipt["action"], items: SmartImportReceiptItem[], libraryChanged: boolean) {
    await persist(context, libraryChanged);
    const result: SmartImportReceipt = { requestId: operation.id, action, completedAt: now(), items, batchRevision: context.row.revision, libraryRevision: context.libraryRevision };
    await context.client.query("INSERT INTO library_private.import_receipts(batch_id,request_id,payload_hash,result) VALUES($1,$2,$3,$4::jsonb)", [context.row.id, operation.id, operation.payloadHash, JSON.stringify(result)]);
    return { ...response(context), receipt: result, replayed: false };
  }
  function resolution(context: Context, input: Record<string, unknown>) {
    const group = groupsByIds(context, [input.groupId])[0];
    if (group.readOnly) throw new LibraryInputError("已处理分组不能再修改，请进入资源编辑。", 409);
    const before = context.state.resources.find(resource => resource.id === input.resourceId);
    if (!before) throw new LibraryInputError("原有资源已不存在，请重新匹配。", 409);
    if (!["link", "restore", "merge"].includes(String(input.mode))) throw new LibraryInputError("关联方式不正确。");
    const after = structuredClone(before);
    if (input.mode === "restore") {
      if (before.status !== "archived") throw new LibraryInputError("这条资源已经不是归档状态，请重新预览。", 409);
      after.status = "organized"; after.visibility = "private"; after.featured = false;
    }
    if (input.mode === "merge") {
      const fields = importRecord(input.fields ?? {}), { notes, ...presentation } = fields;
      Object.assign(after, checkedImportFields(presentation));
      if (notes !== undefined) after.notes = importText(notes, 10000);
    } else if (input.fields !== undefined && Object.keys(importRecord(input.fields)).length) throw new LibraryInputError("只有字段合并允许填写修改字段。");
    const proposal = { groupId: group.id, resourceId: before.id, mode: input.mode, before, after };
    return { group, before, after, proposal, confirmation: confirmation(context, "resolve", proposal) };
  }
  function undoItems(context: Context): SmartImportUndoItem[] {
    const published = new Set(context.publication.resources.map(resource => resource.id));
    const byId = new Map(context.state.resources.map(resource => [resource.id, resource]));
    return context.groups.filter(group => group.createdFingerprint && group.outcome?.resourceId).map(group => {
      const resource = byId.get(group.outcome!.resourceId!);
      const protectedResource = Boolean(group.firstPublishedAt || (resource && (resource.visibility !== "private" || published.has(resource.id) || resource.importBatchId !== context.row.id)));
      const edited = resource && importHash(resource) !== group.createdFingerprint;
      return { groupId: group.id, resourceId: group.outcome!.resourceId!, name: resource?.name ?? group.fields.name,
        disposition: !resource || group.outcome?.kind === "undone" ? "missing" : protectedResource ? "protected" : edited ? "edited" : "eligible",
        reason: !resource ? "资源已不存在" : protectedResource ? "资源曾发布、当前公开或不再属于本批，不能撤回" : edited ? "入库后已修改，默认保留，需单独确认" : "仍为本批创建且未修改的私有资源" };
    });
  }
  function undoConfirmation(context: Context, items: SmartImportUndoItem[]) { const byId = new Map(context.state.resources.map(resource => [resource.id, resource])); return confirmation(context, "undo", { items, resources: items.map(item => byId.get(item.resourceId) ?? null) }); }

  async function handle(value: unknown, ownerId: string): Promise<unknown> {
    const input = importRecord(value);
    return transaction(ownerId, async client => {
      if (input.action === "list") {
        const page = pageNumber(input.page);
        const rows = (await client.query("SELECT id,revision::text AS revision,metadata,created_at,updated_at,count(*) OVER()::int AS total FROM library_private.import_batches WHERE owner_id=$1 ORDER BY created_at DESC,id LIMIT 20 OFFSET $2", [ownerId, (page - 1) * 20])).rows;
        const batches = [];
        for (const row of rows) {
          const metadata = row.metadata as { summary?: Partial<SmartImportBatch["summary"]> };
          // Older batches predate result counts. Upgrade their DTO by projection, never by a read-time write.
          if (!metadata.summary?.resultCounts || metadata.summary.skippedSources === undefined) {
            const context = await load(client, ownerId, row.id); regroup(context); batches.push(batchDto(context));
          } else batches.push({ id: row.id, revision: row.revision, ...row.metadata as object, createdAt: iso(row.created_at as Date), updatedAt: iso(row.updated_at as Date) });
        }
        return { batches, page, pageSize: 20, total: Number(rows[0]?.total ?? 0) };
      }
      if (input.action === "create") {
        const current = await library(client, ownerId), id = requestId(input.requestId);
        const fingerprint = importHash({ format: input.format, content: input.content });
        const prior = (await client.query("SELECT id,fingerprint FROM library_private.import_batches WHERE owner_id=$1 AND create_request_id=$2", [ownerId, id])).rows[0];
        if (prior && prior.fingerprint !== fingerprint) throw new LibraryInputError("上传请求标识已用于其他文件。", 409);
        const resumable = prior ?? (input.forceNew !== true ? (await client.query("SELECT id FROM library_private.import_batches WHERE owner_id=$1 AND fingerprint=$2 AND metadata->>'status' NOT IN ('completed','cancelled') ORDER BY created_at DESC LIMIT 1", [ownerId, fingerprint])).rows[0] : undefined);
        if (resumable) return { ...response(await load(client, ownerId, resumable.id)), resumed: true };
        const sources = parseImportSources(input.content, input.format), batchId = `smart-${randomUUID()}`;
        const metadata = { name: importText(input.name, 160, true), format: input.format, status: "reviewing" };
        const row = (await client.query("INSERT INTO library_private.import_batches(id,owner_id,fingerprint,create_request_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id,owner_id,revision::text AS revision,metadata,created_at,updated_at", [batchId, ownerId, fingerprint, id, JSON.stringify(metadata)])).rows[0] as BatchRow;
        const context: Context = { ...current, client, ownerId, row, sources, groups: regroupImportSources(sources, [], current.state.resources, current.publication, batchId), initialSources: new Map(), initialGroups: new Map() };
        await persist(context);
        return { ...response(context), resumed: false };
      }
      const context = await load(client, ownerId, input.batchId);
      if (input.action === "get") {
        // Match projections are reads: repeated/aborted UI fetches must not advance a batch revision.
        regroup(context);
        const selectedFilters = filters(input.filters), page = pageNumber(input.page), selected = filteredImportGroups(context.groups, selectedFilters);
        const sourceView = selectedFilters.view === "invalid" || selectedFilters.view === "excluded";
        const invalid = context.sources.filter(source => selectedFilters.view === "excluded" ? source.excluded : source.invalidReason && !source.excluded);
        return { ...response(context), groups: selected.slice((page - 1) * 50, page * 50).map(importGroupDto), invalidSources: sourceView ? invalid.slice((page - 1) * 50, page * 50).map(sourceDto) : [], page, pageSize: 50, total: sourceView ? invalid.length : selected.length, facets: importFacets(context.sources, context.groups, Boolean(selectedFilters.resultStatus)) };
      }
      if (input.action === "group") {
        regroup(context);
        const group = groupsByIds(context, [input.groupId])[0], page = pageNumber(input.page), sources = context.sources.filter(source => group.sourceIds.includes(source.id));
        return { ...response(context), group: importGroupDto(group), sources: sources.slice((page - 1) * 50, page * 50).map(sourceDto), total: sources.length, page, pageSize: 50 };
      }
      // Committed request receipts are checked before revisions, so a successful timed-out call can be retried.
      const operation = ["commit", "resolve", "undo"].includes(String(input.action)) ? await replay(context, input) : undefined;
      if (operation?.receipt) return { ...response(context), receipt: operation.receipt, replayed: true };
      revision(input.batchRevision, context.row.revision);
      if (operation) revision(input.libraryRevision, context.libraryRevision);
      if (input.action === "select") {
        regroup(context);
        const groups = filteredImportGroups(context.groups, filters(input.filters)).filter(group => !group.readOnly);
        return { ...response(context), groupIds: groups.map(group => group.id), total: groups.length };
      }
      if (input.action === "pause" || input.action === "resume" || input.action === "cancel") {
        context.row.metadata.status = input.action === "pause" ? "paused" : input.action === "cancel" ? "cancelled" : "reviewing";
        await persist(context); return response(context);
      }
      if (input.action === "delete") {
        if (!["completed", "cancelled"].includes(String(context.row.metadata.status))) throw new LibraryInputError("请先取消未完成批次，再清理记录。");
        await client.query("DELETE FROM library_private.import_batches WHERE id=$1 AND owner_id=$2", [context.row.id, ownerId]);
        return { deleted: true };
      }
      if (input.action === "undo-preview") {
        const items = undoItems(context);
        return { ...response(context), items, defaultGroupIds: items.filter(item => item.disposition === "eligible").map(item => item.groupId), confirmation: undoConfirmation(context, items) };
      }
      if (input.action === "undo") {
        const items = undoItems(context), selected = groupsByIds(context, input.groupIds), edited = input.includeEditedResourceIds === undefined || (Array.isArray(input.includeEditedResourceIds) && !input.includeEditedResourceIds.length) ? [] : importIds(input.includeEditedResourceIds);
        checkConfirmation(input, undoConfirmation(context, items));
        const results: SmartImportReceiptItem[] = [];
        const byGroup = new Map(items.map(item => [item.groupId, item])), removedIds = new Set<string>();
        for (const group of selected) {
          const item = byGroup.get(group.id);
          if (!item || (item.disposition !== "eligible" && !(item.disposition === "edited" && edited.includes(item.resourceId)))) { results.push({ groupId: group.id, status: "skipped", resourceId: item?.resourceId ?? null, reason: item?.reason ?? "本批并未创建此资源" }); continue; }
          removedIds.add(item.resourceId);
          group.outcome = { kind: "undone", resourceId: item.resourceId, completedAt: now() }; group.revision = String(BigInt(group.revision) + BigInt(1));
          results.push({ groupId: group.id, status: "undone", resourceId: item.resourceId, reason: null });
        }
        context.state.resources = context.state.resources.filter(resource => !removedIds.has(resource.id));
        return receipt(context, operation!, "undo", results, results.some(item => item.status === "undone"));
      }
      active(context);
      if (input.action === "refresh") { regroup(context); await persist(context); return response(context); }
      if (input.action === "decide") {
        // Apply an explicit decision to today's matches, rather than preserving a vanished match ID.
        regroup(context);
        if (input.decision !== undefined && !["keep", "defer", "ignore"].includes(String(input.decision))) throw new LibraryInputError("筛选决定不正确。");
        const fields = checkedImportFields(input.fields ?? {});
        if (input.decision === undefined && !Object.keys(fields).length && input.adoptSuggestion !== true) throw new LibraryInputError("请选择一项批量操作。");
        for (const group of groupsByIds(context, input.groupIds)) {
          if (group.readOnly) throw new LibraryInputError("选中了已入库的只读分组，请重新选择。", 409);
          if (input.adoptSuggestion === true && group.suggestion) { const { kind, category, tags, description } = group.suggestion; Object.assign(group.manualFields, { kind, category, tags, description }); group.categoryConfirmed = true; }
          Object.assign(group.manualFields, fields); Object.assign(group.fields, group.manualFields);
          if (fields.category) group.categoryConfirmed = true;
          if (input.decision !== undefined) group.decision = input.decision as ImportGroupRecord["decision"];
          // Classification edits cannot silently approve changed matches or duplicate relationships.
          if (input.decision === "keep") {
            group.reviewRequired = false; group.reviewReasons = [];
            group.formerMatchIds = group.matches.filter(match => match.location === "library").map(match => match.id);
            group.reviewAcknowledgement = importRelationshipHash(group);
          }
          group.error = null;
          group.revision = String(BigInt(group.revision) + BigInt(1)); updateIntent(context, group);
        }
        await persist(context); return response(context);
      }
      if (input.action === "edit-source" || input.action === "representative") {
        const source = context.sources.find(source => source.id === input.sourceId);
        if (!source) throw new LibraryInputError("来源不存在。", 404);
        if (context.groups.some(group => group.readOnly && group.sourceIds.includes(source.id))) throw new LibraryInputError("已入库来源不能修改，请进入资源编辑。", 409);
        if (input.action === "edit-source") context.sources[context.sources.indexOf(source)] = editImportSource(source, input.changes);
        else {
          const group = groupsByIds(context, [input.groupId])[0];
          if (group.readOnly || !group.sourceIds.includes(source.id) || source.excluded || source.invalidReason) throw new LibraryInputError("请选择本组内有效且未排除的来源。");
          group.representativeId = source.id;
        }
        regroup(context); await persist(context); return response(context);
      }
      if (input.action === "commit-preview") {
        regroup(context);
        const mode = suggestionMode(input.suggestionMode), groups = groupsByIds(context, input.groupIds), items = groups.map(group => plan(context, group, mode));
        return { ...response(context), groupIds: groups.map(group => group.id), items, confirmation: confirmation(context, "commit", items) };
      }
      if (input.action === "resolve-preview" || input.action === "resolve") {
        const resolved = resolution(context, input);
        if (input.action === "resolve-preview") return { ...response(context), ...resolved.proposal, confirmation: resolved.confirmation };
        checkConfirmation(input, resolved.confirmation);
        const changed = input.mode !== "link";
        if (changed) { resolved.after.updatedAt = now(); context.state.resources[context.state.resources.indexOf(resolved.before)] = resolved.after; resolved.group.existingChange = { before: resolved.before, afterFingerprint: importHash(resolved.after) }; }
        const kind = input.mode === "restore" ? "restored" : input.mode === "merge" ? "merged" : "linked";
        resolved.group.outcome = { kind, resourceId: resolved.before.id, completedAt: now() }; resolved.group.readOnly = true; resolved.group.revision = String(BigInt(resolved.group.revision) + BigInt(1));
        return receipt(context, operation!, "resolve", [{ groupId: resolved.group.id, status: kind, resourceId: resolved.before.id, reason: null }], changed);
      }
      if (input.action === "commit") {
        // Recompute the same read-only proposal used by preview, under the shared write lock.
        regroup(context);
        const mode = suggestionMode(input.suggestionMode), groups = groupsByIds(context, input.groupIds, 100), plans = groups.map(group => plan(context, group, mode));
        checkConfirmation(input, confirmation(context, "commit", plans));
        const results: SmartImportReceiptItem[] = [];
        let bytes = importJsonbBytes(context.state);
        for (const [index, group] of groups.entries()) {
          const proposed = plans[index];
          if (proposed.disposition !== "create") {
            const status = proposed.disposition === "already-completed" ? "already-completed" : proposed.disposition === "skip-existing" ? "skipped" : proposed.disposition === "needs-review" ? "needs-review" : "failed";
            if (status === "skipped") { group.outcome = { kind: "skipped", resourceId: proposed.existingResourceId, completedAt: now() }; group.readOnly = true; }
            if (status === "needs-review" && mode === "preserve") { group.reviewRequired = true; group.reviewReasons = [proposed.reason!]; }
            results.push({ groupId: group.id, status, resourceId: group.outcome?.resourceId ?? proposed.existingResourceId, reason: proposed.reason }); continue;
          }
          const timestamp = now();
          const proposal = proposed.proposal ?? projectImportAcceptance(group, "preserve");
          const resource: LibraryResource = { id: `saved-${randomUUID()}`, ...proposal.fields, url: group.representative.url, icon: "", subcategory: "", recommendation: "", audience: "", usage: "", boundary: "", alternatives: [], relatedHref: "", featured: false, usedByVitamin: false, updatedAt: timestamp, visibility: "private", status: proposal.status, pinned: false, notes: "", source: "浏览器书签", sourceFolder: group.representative.sourceFolder, createdAt: group.representative.createdAt, importedAt: timestamp, importBatchId: context.row.id };
          const size = importJsonbBytes(resource) + (context.state.resources.length ? 2 : 0);
          if (context.state.resources.length >= MAX_RESOURCES || bytes + size > MAX_STORE_BYTES) { group.error = "资源库达到 20000 条或 32 MB 上限，未新增本项"; results.push({ groupId: group.id, status: "failed", resourceId: null, reason: group.error }); continue; }
          bytes += size; context.state.resources.unshift(resource); group.createdFingerprint = importHash(resource); group.outcome = { kind: "created", resourceId: resource.id, completedAt: timestamp }; group.readOnly = true; group.decision = "keep"; group.error = null; group.revision = String(BigInt(group.revision) + BigInt(1));
          if (mode === "accept-preserving-manual") {
            for (const key of proposal.adoptedFields) Object.assign(group.manualFields, { [key]: proposal.fields[key] });
            group.fields = proposal.fields; group.categoryConfirmed = proposal.categoryConfirmed; updateIntent(context, group);
          }
          results.push({ groupId: group.id, status: "created", resourceId: resource.id, reason: null });
        }
        return receipt(context, operation!, "commit", results, results.some(item => item.status === "created"));
      }
      throw new LibraryInputError("不支持此导入操作。");
    });
  }

  function capturedTargets(context: Context, groups: ImportGroupRecord[]): SmartImportAnalysisCapture {
    const targets: SmartImportAnalysisTarget[] = [], excluded: { id: string; reason: string }[] = [];
    for (const group of groups) {
      let reason = ["paused", "cancelled"].includes(String(context.row.metadata.status)) ? "批次已暂停或取消" : group.readOnly ? "本组已处理" : group.decision === "ignore" ? "本组已忽略" : "";
      const domain = publicModelDomain(group.representative.url);
      if (!domain) reason ||= "内部、私人路径或含凭据参数的链接只支持规则与手工整理";
      if (reason) excluded.push({ id: group.id, reason });
      else targets.push({ id: group.id, title: group.fields.name, domain: domain!, groupRevision: group.revision });
    }
    return { ...response(context), targets, excluded };
  }
  async function claimTargets(input: { batchId: string; batchRevision: string; groupIds: string[] }, ownerId: string) {
    return transaction(ownerId, async client => { const context = await load(client, ownerId, input.batchId); revision(input.batchRevision, context.row.revision); return capturedTargets(context, groupsByIds(context, input.groupIds)); });
  }
  async function revalidateTargets(input: { batchId: string; targets: { id: string; groupRevision: string }[] }, ownerId: string) {
    return transaction(ownerId, async client => {
      const context = await load(client, ownerId, input.batchId), groups: ImportGroupRecord[] = [], stale: { id: string; reason: string }[] = [];
      for (const target of input.targets) { const group = context.groups.find(group => group.id === target.id); if (!group || group.revision !== target.groupRevision) stale.push({ id: target.id, reason: "候选已编辑或重新分组" }); else groups.push(group); }
      const result = capturedTargets(context, groups); result.excluded.push(...stale); return result;
    });
  }
  async function applySuggestions(input: { batchId: string; analysisJobId?: string; results: SmartImportSuggestionResult[] }, ownerId: string) {
    return transaction(ownerId, async client => {
      const context = await load(client, ownerId, input.batchId), appliedIds: string[] = [], ignored: { id: string; reason: string }[] = [];
      if (input.results.length > 100) throw new LibraryInputError("每次最多保存 100 项建议。");
      if (input.analysisJobId !== undefined) {
        const job = (await client.query("SELECT state->>'status' AS status FROM library_private.analysis_jobs WHERE id=$1 AND owner_id=$2 AND batch_id=$3", [input.analysisJobId, ownerId, context.row.id])).rows[0];
        if (!job || job.status === "cancelled") return { ...response(context), appliedIds, ignored: input.results.map(result => ({ id: result.id, reason: "分析任务已取消或不存在，结果未回写" })) };
      }
      for (const result of input.results) {
        const group = context.groups.find(group => group.id === result.id);
        if (!group || group.revision !== result.groupRevision || group.readOnly || group.decision === "ignore" || context.row.metadata.status === "cancelled") { ignored.push({ id: result.id, reason: "候选已修改、处理、忽略或批次取消，保留人工决定" }); continue; }
        const fields = checkedImportFields({ kind: result.suggestion.kind, category: result.suggestion.category, tags: result.suggestion.tags, description: result.suggestion.description });
        if (!fields.kind || !fields.category || !fields.tags || fields.description === undefined || !["clear", "review"].includes(result.suggestion.confidence) || !["model", "rule"].includes(result.suggestion.source)) throw new LibraryInputError("模型分类建议格式不正确。");
        group.suggestion = { ...fields, reason: importText(result.suggestion.reason, 500, true), confidence: result.suggestion.confidence, source: result.suggestion.source } as NonNullable<ImportGroupRecord["suggestion"]>;
        group.revision = String(BigInt(group.revision) + BigInt(1)); appliedIds.push(group.id);
      }
      if (appliedIds.length) await persist(context);
      return { ...response(context), appliedIds, ignored };
    });
  }
  return { handle, claimTargets, revalidateTargets, applySuggestions };
}

export function getSmartImportStore() { return createSmartImportStore(getDatabasePool()); }
