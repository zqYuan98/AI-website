import "server-only";

import { randomUUID } from "node:crypto";
import type { LibraryConnection, LibraryPool } from "@/lib/cloud-library";
import { LibraryInputError, libraryObject } from "@/lib/library-domain";
import { SmartApiCallError, type SmartApiAccessRestriction, type SmartApiResponseType } from "./smart-api-client";
import type { AnalysisDestination, AnalysisJob, AnalysisPreview, AnalysisStatus } from "@/lib/smart-analysis-types";
import type { ApiConfigView, ApiSettings, ModelSuggestion, ModelUsage } from "@/lib/smart-api-types";
import type { SmartImportAnalysisCapture, SmartImportAnalysisTarget, SmartImportSuggestionResult, SmartImportSuggestionsApplied } from "@/lib/smart-import-types";

const MAX_CANDIDATES = 500;
const PREVIEW_DNS_CHUNK = 20;
const PREVIEW_DNS_BUDGET_MS = 20_000;
type Target = SmartImportAnalysisTarget & { status: "pending" | "working" | "succeeded" | "ignored" | "failed"; requestId?: string };
type FailureDiagnostic = { outcome: "unknown" | "rejected" | "invalid_response"; message: string; status?: number; upstreamStatus?: number; responseType?: SmartApiResponseType; accessRestriction?: SmartApiAccessRestriction };
type JobState = {
  confirmation: string; config: AnalysisDestination; settings: ApiSettings; targets: Target[]; status: AnalysisStatus;
  requests: number; reservedCost: number | null; possibleCharge: boolean; message: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  lastFailure?: FailureDiagnostic;
};
type StoredPreview = AnalysisPreview & { settings: ApiSettings };
type JobRow = { id: string; ownerId: string; batchId: string; revision: string; state: JobState; createdAt: string; updatedAt: string };
export type AnalysisDependencies = {
  readConfig(ownerId: string): Promise<ApiConfigView>;
  checkPublicTargets(targets: SmartImportAnalysisTarget[]): Promise<{ targets: SmartImportAnalysisTarget[]; excluded: { id: string; reason: string }[] }>;
  capture(input: { batchId: string; batchRevision: string; groupIds: string[] }, ownerId: string): Promise<SmartImportAnalysisCapture>;
  revalidate(input: { batchId: string; targets: { id: string; groupRevision: string }[] }, ownerId: string): Promise<SmartImportAnalysisCapture>;
  apply(input: { batchId: string; analysisJobId: string; results: SmartImportSuggestionResult[] }, ownerId: string): Promise<SmartImportSuggestionsApplied>;
  assertConfig(client: LibraryConnection, ownerId: string, version: string): Promise<void>;
  send(ownerId: string, version: string, targets: SmartImportAnalysisTarget[], beforeSend: () => Promise<void>): Promise<{ suggestions: ModelSuggestion[]; usage: ModelUsage | null }>;
};

function requiredText(value: unknown, name: string, max = 128): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new LibraryInputError(`${name}无效。`);
  return value.trim();
}
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
function row(value: Record<string, unknown>): JobRow {
  return { id: String(value.id), ownerId: String(value.owner_id), batchId: String(value.batch_id), revision: String(value.revision), state: value.state as JobState, createdAt: iso(value.created_at), updatedAt: iso(value.updated_at) };
}
function view(job: JobRow): AnalysisJob {
  const { state } = job;
  return {
    id: job.id, batchId: job.batchId, revision: job.revision, status: state.status, config: state.config,
    total: state.targets.length, pending: state.targets.filter(t => t.status === "pending" || t.status === "working").length,
    succeeded: state.targets.filter(t => t.status === "succeeded").length,
    ignored: state.targets.filter(t => t.status === "ignored").length, failed: state.targets.filter(t => t.status === "failed").length,
    requests: state.requests, possibleCharge: state.possibleCharge, estimatedReservedCost: state.reservedCost,
    usage: state.usage, message: state.message, createdAt: job.createdAt, updatedAt: job.updatedAt,
  };
}
function destination(config: ApiConfigView): AnalysisDestination {
  return { id: config.id, version: config.version, name: config.settings.name, baseUrl: config.settings.baseUrl, model: config.settings.model };
}
function enabledConfig(config: ApiConfigView, version: unknown) {
  if (config.version !== version || !config.enabled || !config.hasKey || config.testedVersion !== config.version) {
    throw new LibraryInputError("模型配置已变化或尚未启用，请先保存并测试配置，再重新预览发送范围。", 409);
  }
}
function failureDiagnostic(error: unknown, sent: boolean): FailureDiagnostic {
  const fallback = sent ? "这组分析没有获得可用结果，可能已计费。已完成部分已保存，失败项不会自动重复发送。" : "发送前检查未通过，未发送的内容已保留。请核对批次或模型配置后继续。";
  if (!(error instanceof SmartApiCallError)) return { outcome: "unknown", message: fallback };
  // This class is constructed with application-owned messages. Never copy an arbitrary exception or its properties.
  const outcome = error.outcome === "rejected" || error.outcome === "invalid_response" ? error.outcome : "unknown";
  const result: FailureDiagnostic = { outcome, message: error.message };
  if (Number.isInteger(error.status) && error.status >= 100 && error.status <= 599) result.status = error.status;
  if (error.upstreamStatus !== undefined && Number.isInteger(error.upstreamStatus) && error.upstreamStatus >= 100 && error.upstreamStatus <= 599) result.upstreamStatus = error.upstreamStatus;
  if (error.responseType === "json" || error.responseType === "html" || error.responseType === "other") result.responseType = error.responseType;
  if (error.accessRestriction === "browser_challenge") result.accessRestriction = error.accessRestriction;
  return result;
}
function failureMessage(failure: FailureDiagnostic, sent: boolean): string {
  if (!sent) return `发送前检查未完成，未发送的内容已保留。${failure.message}`;
  const prefix = failure.outcome === "rejected" ? "模型服务拒绝了本次请求。" : failure.outcome === "invalid_response" ? "响应未通过兼容性或完整性检查。" : "本次请求结果未知，可能已计费。";
  return `${prefix}${failure.message}已完成部分会保留，本次不会自动重试。`;
}
/** A deliberately conservative byte-based token estimate, not a provider billing promise. */
export function estimateAnalysisCost(settings: ApiSettings, targets: Pick<SmartImportAnalysisTarget, "id" | "title" | "domain">[]): number | null {
  if (settings.inputPricePerMillion === null || settings.outputPricePerMillion === null) return null;
  const bytes = Buffer.byteLength(JSON.stringify(targets), "utf8") + 8192;
  return (bytes * settings.inputPricePerMillion + settings.maxOutputTokens * settings.outputPricePerMillion) / 1_000_000;
}

export function createSmartAnalysisStore(pool: LibraryPool, owner: () => string, deps: AnalysisDependencies) {
  function authorize(ownerId: string) {
    if (!ownerId || ownerId !== owner()) throw new LibraryInputError("无权访问智能筛选任务。", 403);
  }
  async function transaction<T>(work: (client: LibraryConnection) => Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Driver diagnostics never leave this module. */ }
      throw error;
    } finally { client.release(); }
  }
  async function lockOwner(client: LibraryConnection, ownerId: string) {
    const result = await client.query("SELECT owner_id FROM library_private.state WHERE singleton = true FOR UPDATE");
    if (result.rows[0]?.owner_id !== ownerId) throw new LibraryInputError("资源库尚未就绪。", 503);
  }
  async function readJob(client: Pick<LibraryConnection, "query">, id: string, ownerId: string, lock = false) {
    const result = await client.query(`SELECT *, revision::text AS revision FROM library_private.analysis_jobs WHERE id=$1 AND owner_id=$2${lock ? " FOR UPDATE" : ""}`, [id, ownerId]);
    if (!result.rows[0]) throw new LibraryInputError("未找到这项分析任务。", 404);
    return row(result.rows[0]);
  }
  async function persist(client: LibraryConnection, job: JobRow) {
    const result = await client.query("UPDATE library_private.analysis_jobs SET state=$1::jsonb,revision=revision+1,updated_at=now() WHERE id=$2 AND owner_id=$3 RETURNING revision::text AS revision,updated_at", [JSON.stringify(job.state), job.id, job.ownerId]);
    job.revision = String(result.rows[0].revision);
    job.updatedAt = iso(result.rows[0].updated_at);
  }
  async function assertNoOverlappingWork(client: LibraryConnection, ownerId: string, batchId: string, targetIds: string[], exceptJobId: string | null = null) {
    const selected = new Set(targetIds);
    if (!selected.size) return;
    // Both start and resume hold the owner lock, so concurrent browser actions cannot approve duplicate work.
    const activeJobs = await client.query("SELECT state FROM library_private.analysis_jobs WHERE owner_id=$1 AND batch_id=$2 AND ($3::text IS NULL OR id<>$3) AND state->>'status' IN ('queued','running')", [ownerId, batchId, exceptJobId]);
    if (activeJobs.rows.some(record => (record.state as JobState).targets.some(target => selected.has(target.id) && (target.status === "pending" || target.status === "working")))) {
      throw new LibraryInputError("所选条目已有正在执行的分析任务，请查看该任务进度。", 409);
    }
    // Pausing or cancelling cannot recall an in-flight request. Expired leases follow the existing recovery rules.
    const requests = await client.query("SELECT request.target_ids FROM library_private.analysis_requests AS request JOIN library_private.analysis_jobs AS job ON job.id=request.job_id WHERE request.owner_id=$1 AND job.owner_id=$1 AND job.batch_id=$2 AND ($3::text IS NULL OR job.id<>$3) AND request.status IN ('reserved','sent') AND request.lease_until > now()", [ownerId, batchId, exceptJobId]);
    if (requests.rows.some(record => (record.target_ids as string[]).some(id => selected.has(id)))) {
      throw new LibraryInputError("所选条目仍有未确认结果的请求，请先等待原任务结束或核对原任务状态，再重新操作。", 409);
    }
  }
  async function preview(input: Record<string, unknown>, ownerId: string): Promise<AnalysisPreview> {
    authorize(ownerId);
    const batchId = requiredText(input.batchId, "批次");
    const batchRevision = requiredText(input.batchRevision, "批次版本");
    if (!Array.isArray(input.groupIds) || !input.groupIds.length || input.groupIds.length > 5000) throw new LibraryInputError("请明确选择本批需要分析的条目。");
    if (input.limit !== undefined && input.limit !== 5) throw new LibraryInputError("小范围体验只支持最多 5 个资源；完整分析请省略此限制。");
    const groupIds = [...new Set(input.groupIds.map(id => requiredText(id, "候选")))];
    const config = await deps.readConfig(ownerId);
    enabledConfig(config, input.configVersion);
    const capture = await deps.capture({ batchId, batchRevision, groupIds }, ownerId);
    const previewLimit = input.limit === 5 ? 5 : MAX_CANDIDATES;
    const maximum = Math.min(previewLimit, config.settings.batchSize * config.settings.maxRequests);
    const scopeLimitReason = input.limit === 5 && maximum === 5 ? "本次先试最多 5 个资源，剩余资源尚未发送，可之后继续整理。" : "超过本次分析条数或请求数限制，可下次继续。";
    const targets: SmartImportAnalysisTarget[] = [], excluded = [...capture.excluded];
    // Filter before filling the send limit. A private/unknown prefix must not consume all 500 slots.
    // Cache only within this preview; start and transport still recheck DNS independently.
    const domains = new Map<string, string | null>(), deadline = Date.now() + PREVIEW_DNS_BUDGET_MS;
    let cursor = 0;
    while (cursor < capture.targets.length && targets.length < maximum && Date.now() < deadline) {
      const chunk = capture.targets.slice(cursor, cursor + PREVIEW_DNS_CHUNK);
      const unknown = [...new Map(chunk.filter(target => !domains.has(target.domain)).map(target => [target.domain, target])).values()];
      if (unknown.length) {
        const checked = await deps.checkPublicTargets(unknown);
        const allowed = new Set(checked.targets.map(target => target.id)), reasons = new Map(checked.excluded.map(target => [target.id, target.reason]));
        for (const target of unknown) domains.set(target.domain, allowed.has(target.id) ? null : reasons.get(target.id) ?? "域名无法确认指向公网，仅保留规则建议与手工整理。");
      }
      for (const target of chunk) {
        cursor++;
        if (targets.length >= maximum) { excluded.push({ id: target.id, reason: scopeLimitReason }); continue; }
        const reason = domains.get(target.domain);
        if (reason) excluded.push({ id: target.id, reason });
        else targets.push(target);
      }
    }
    const remainingReason = targets.length >= maximum ? scopeLimitReason : "本轮域名检查已达到时间上限，尚未检查的条目可下次继续。";
    excluded.push(...capture.targets.slice(cursor).map(target => ({ id: target.id, reason: remainingReason })));
    if (!targets.length) throw new LibraryInputError(cursor < capture.targets.length ? "本轮域名检查已达到时间上限，尚有条目未检查，请选择较小范围后继续。" : "所选条目没有适合发送到外部模型的内容，可继续手工整理。");
    let estimatedCost: number | null = 0;
    for (let index = 0; index < targets.length; index += config.settings.batchSize) {
      const estimate = estimateAnalysisCost(config.settings, targets.slice(index, index + config.settings.batchSize));
      if (estimate === null) { estimatedCost = null; break; }
      estimatedCost += estimate;
    }
    const result: AnalysisPreview = {
      confirmation: randomUUID(), expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), batchId, batchRevision: capture.batchRevision,
      config: destination(config), targets, excluded,
      limits: { batchSize: config.settings.batchSize, maxRequests: config.settings.maxRequests, concurrency: config.settings.concurrency, maxOutputTokens: config.settings.maxOutputTokens, maxCandidates: previewLimit },
      estimatedRequests: Math.ceil(targets.length / config.settings.batchSize), estimatedCost, estimatedBudget: config.settings.estimatedBudget,
    };
    await pool.query("DELETE FROM library_private.analysis_previews WHERE owner_id=$1 AND expires_at < now()", [ownerId]);
    const stored: StoredPreview = { ...result, settings: config.settings };
    await pool.query("INSERT INTO library_private.analysis_previews(id,owner_id,batch_id,payload) VALUES($1,$2,$3,$4::jsonb)", [result.confirmation, ownerId, result.batchId, JSON.stringify(stored)]);
    return result;
  }
  async function start(input: Record<string, unknown>, ownerId: string) {
    authorize(ownerId);
    const requestId = requiredText(input.requestId, "请求标识");
    const confirmation = requiredText(input.confirmation, "发送预览");
    // A lost response can replay the same receipt even after the preview has expired.
    const existing = await pool.query("SELECT *,revision::text AS revision FROM library_private.analysis_jobs WHERE owner_id=$1 AND request_id=$2", [ownerId, requestId]);
    if (existing.rows[0]) {
      const previous = row(existing.rows[0]);
      if (previous.state.confirmation !== confirmation) throw new LibraryInputError("此请求标识已用于另一次发送预览，请重新确认。", 409);
      return { job: view(previous) };
    }
    const found = await pool.query("SELECT payload FROM library_private.analysis_previews WHERE id=$1 AND owner_id=$2 AND expires_at > now()", [confirmation, ownerId]);
    if (!found.rows[0]) throw new LibraryInputError("发送预览已过期，请重新核对条目与模型服务。", 409);
    const saved = found.rows[0].payload as StoredPreview;
    enabledConfig(await deps.readConfig(ownerId), saved.config.version);
    const current = await deps.revalidate({ batchId: saved.batchId, targets: saved.targets }, ownerId);
    if (["paused", "cancelled"].includes(current.batch.status) || current.targets.length !== saved.targets.length) throw new LibraryInputError("候选条目已变化或批次已暂停，请重新预览。", 409);
    if ((await deps.checkPublicTargets(current.targets)).targets.length !== saved.targets.length) throw new LibraryInputError("部分域名已无法确认为公网，请重新预览发送范围。", 409);
    return transaction(async client => {
      await lockOwner(client, ownerId);
      const replay = await client.query("SELECT *,revision::text AS revision FROM library_private.analysis_jobs WHERE owner_id=$1 AND request_id=$2", [ownerId, requestId]);
      if (replay.rows[0]) {
        const previous = row(replay.rows[0]);
        if (previous.state.confirmation !== confirmation) throw new LibraryInputError("此请求标识已用于另一次发送预览，请重新确认。", 409);
        return { job: view(previous) };
      }
      await deps.assertConfig(client, ownerId, saved.config.version);
      await assertNoOverlappingWork(client, ownerId, saved.batchId, saved.targets.map(target => target.id));
      const state: JobState = { confirmation, config: saved.config, settings: saved.settings, targets: saved.targets.map(t => ({ ...t, status: "pending" })), status: "queued", requests: 0, reservedCost: saved.estimatedCost === null ? null : 0, possibleCharge: false, message: null, usage: null };
      const result = await client.query("INSERT INTO library_private.analysis_jobs(id,owner_id,batch_id,request_id,state) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING *,revision::text AS revision", [randomUUID(), ownerId, saved.batchId, requestId, JSON.stringify(state)]);
      return { job: view(row(result.rows[0])) };
    });
  }
  async function get(jobId: string, ownerId: string) { authorize(ownerId); return { job: view(await readJob(pool, requiredText(jobId, "任务"), ownerId)) }; }
  async function list(batchId: string, ownerId: string) {
    authorize(ownerId);
    const rows = await pool.query("SELECT *,revision::text AS revision FROM library_private.analysis_jobs WHERE owner_id=$1 AND batch_id=$2 ORDER BY updated_at DESC LIMIT 50", [ownerId, requiredText(batchId, "批次")]);
    return { jobs: rows.rows.map(r => view(row(r))) };
  }
  async function control(input: Record<string, unknown>, ownerId: string) {
    authorize(ownerId);
    const id = requiredText(input.jobId, "任务");
    const config = input.action === "resume" ? await deps.readConfig(ownerId) : null;
    return transaction(async client => {
      await lockOwner(client, ownerId);
      const job = await readJob(client, id, ownerId, true);
      if (input.revision !== job.revision) throw new LibraryInputError("分析进度已更新，请刷新后重试。", 409);
      if (input.action === "resume") {
        if (config) enabledConfig(config, job.state.config.version);
        if (job.state.status === "cancelled" || job.state.status === "completed") throw new LibraryInputError("任务已结束，可在工作区重新选择待处理条目。");
        const resumed = job.state.targets.filter(target => target.status === "pending" || target.status === "working" || (input.retryFailed === true && target.status === "failed"));
        await assertNoOverlappingWork(client, ownerId, job.batchId, resumed.map(target => target.id), job.id);
        if (input.retryFailed === true) for (const target of job.state.targets) if (target.status === "failed") target.status = "pending";
        job.state.status = "queued";
        job.state.message = null;
        delete job.state.lastFailure;
      } else if (input.action === "pause") {
        if (job.state.status !== "completed" && job.state.status !== "cancelled") job.state.status = "paused";
      } else if (input.action === "cancel") job.state.status = "cancelled";
      else throw new LibraryInputError("不支持的分析操作。");
      await persist(client, job);
      return { job: view(job) };
    });
  }
  async function handle(value: unknown, ownerId: string) {
    const input = libraryObject(value);
    switch (input.action) {
      case "preview": return preview(input, ownerId);
      case "start": return start(input, ownerId);
      case "get": return get(requiredText(input.jobId, "任务"), ownerId);
      case "list": return list(requiredText(input.batchId, "批次"), ownerId);
      case "pause": case "resume": case "cancel": return control(input, ownerId);
      default: throw new LibraryInputError("不支持的分析操作。");
    }
  }

  async function reserve(jobId: string, ownerId: string) {
    return transaction(async client => {
      await lockOwner(client, ownerId);
      const job = await readJob(client, jobId, ownerId, true);
      const expired = await client.query("UPDATE library_private.analysis_requests SET status='unknown',finished_at=now() WHERE job_id=$1 AND status IN ('reserved','sent') AND lease_until <= now() RETURNING id", [jobId]);
      if (expired.rows.length) {
        const expiredIds = new Set(expired.rows.map(r => String(r.id)));
        for (const target of job.state.targets) if (target.requestId && expiredIds.has(target.requestId) && target.status === "working") target.status = "failed";
        job.state.possibleCharge = true;
        if (job.state.status !== "cancelled") job.state.status = "paused";
        job.state.message = "上次请求没有确认结果，可能已计费。已保存完成部分，请核对后决定是否重试失败项。";
        await persist(client, job);
      }
      if (!["queued", "running"].includes(job.state.status)) return { more: false, claim: null };
      try { await deps.assertConfig(client, ownerId, job.state.config.version); }
      catch {
        job.state.status = "paused";
        job.state.message = "模型配置已变化或停用，尚未发送的条目已暂停。请重新预览目标和范围。";
        await persist(client, job);
        return { more: false, claim: null };
      }
      const targets = job.state.targets.filter(t => t.status === "pending").slice(0, job.state.settings.batchSize);
      if (!targets.length) {
        if (job.state.targets.some(t => t.status === "working")) return { more: true, claim: null };
        job.state.status = job.state.targets.some(t => t.status === "failed") ? "paused" : "completed";
        await persist(client, job);
        return { more: false, claim: null };
      }
      const estimate = estimateAnalysisCost(job.state.settings, targets);
      const budget = job.state.settings.estimatedBudget;
      if (job.state.requests >= job.state.settings.maxRequests || (estimate !== null && budget !== null && (job.state.reservedCost ?? 0) + estimate > budget)) {
        // Already reserved calls may use their allotted budget before the remainder is paused.
        if (job.state.targets.some(t => t.status === "working")) return { more: true, claim: null };
        job.state.status = "paused";
        job.state.message = "已达到本次请求数或估算预算上限，剩余条目已保留。可减少范围后重新预览。";
        await persist(client, job);
        return { more: false, claim: null };
      }
      // The owner state row serializes reservations across jobs and browser sessions.
      const active = await client.query("SELECT count(*)::text AS count FROM library_private.analysis_requests WHERE owner_id=$1 AND status IN ('reserved','sent') AND lease_until > now()", [ownerId]);
      const testing = await client.query("SELECT 1 AS active FROM library_private.smart_api_settings WHERE owner_id=$1 AND test_active_until > now()", [ownerId]);
      if (Number(active.rows[0].count) + testing.rows.length >= job.state.settings.concurrency) return { more: true, claim: null };
      const requestId = randomUUID();
      for (const target of targets) { target.status = "working"; target.requestId = requestId; }
      job.state.requests++;
      if (estimate !== null) job.state.reservedCost = (job.state.reservedCost ?? 0) + estimate;
      job.state.status = "running";
      job.state.message = null;
      await client.query("INSERT INTO library_private.analysis_requests(id,job_id,owner_id,config_version,status,target_ids,reserved_cost,lease_until) VALUES($1,$2,$3,$4,'reserved',$5::jsonb,$6,now()+interval '90 seconds')", [requestId, job.id, ownerId, job.state.config.version, JSON.stringify(targets.map(t => t.id)), estimate]);
      await persist(client, job);
      return { more: true, claim: { requestId, jobId: job.id, batchId: job.batchId, version: job.state.config.version, targets: targets.map(({ id, title, domain, groupRevision }) => ({ id, title, domain, groupRevision })) } };
    });
  }
  async function markSent(jobId: string, requestId: string, ownerId: string, targets: SmartImportAnalysisTarget[]) {
    return transaction(async client => {
      await lockOwner(client, ownerId);
      const job = await readJob(client, jobId, ownerId, true);
      if (!["queued", "running"].includes(job.state.status)) return false;
      const batch = await client.query("SELECT metadata FROM library_private.import_batches WHERE id=$1 AND owner_id=$2", [job.batchId, ownerId]);
      if (!batch.rows[0] || ["paused", "cancelled"].includes(String((batch.rows[0].metadata as Record<string, unknown>).status))) return false;
      const groups = await client.query("SELECT id,data FROM library_private.import_groups WHERE batch_id=$1 AND id=ANY($2::text[])", [job.batchId, targets.map(t => t.id)]);
      const expected = new Map(targets.map(t => [t.id, t.groupRevision]));
      if (groups.rows.length !== targets.length || groups.rows.some(group => {
        const data = group.data as Record<string, unknown>;
        return data.revision !== expected.get(String(group.id)) || data.readOnly === true || data.decision === "ignore";
      })) return false;
      try { await deps.assertConfig(client, ownerId, job.state.config.version); }
      catch { return false; }
      const changed = await client.query("UPDATE library_private.analysis_requests SET status='sent',lease_until=now()+interval '90 seconds' WHERE id=$1 AND job_id=$2 AND status='reserved' AND lease_until > now() RETURNING id", [requestId, jobId]);
      return changed.rows.length === 1;
    });
  }
  async function settle(jobId: string, requestId: string, ownerId: string, result: {
    disposition: "succeeded" | "failed" | "cancelled";
    appliedIds?: string[]; ignoredIds?: string[]; usage?: ModelUsage | null; message?: string; pause?: boolean; failure?: FailureDiagnostic;
  }) {
    return transaction(async client => {
      await lockOwner(client, ownerId);
      const job = await readJob(client, jobId, ownerId, true);
      const request = await client.query("SELECT status,reserved_cost FROM library_private.analysis_requests WHERE id=$1 AND job_id=$2 FOR UPDATE", [requestId, jobId]);
      const record = request.rows[0];
      if (!record || !["reserved", "sent"].includes(String(record.status))) return { more: ["running", "queued"].includes(job.state.status) };
      const applied = new Set(result.appliedIds ?? []);
      const ignored = new Set(result.ignoredIds ?? []);
      for (const target of job.state.targets) if (target.requestId === requestId && target.status === "working") {
        if (ignored.has(target.id)) target.status = "ignored";
        else if (result.disposition === "cancelled") target.status = "pending";
        else if (result.disposition === "failed") target.status = "failed";
        else target.status = applied.has(target.id) ? "succeeded" : "ignored";
      }
      if (result.disposition === "cancelled" && record.status === "reserved") {
        job.state.requests = Math.max(0, job.state.requests - 1);
        if (job.state.reservedCost !== null) job.state.reservedCost = Math.max(0, job.state.reservedCost - Number(record.reserved_cost ?? 0));
      }
      if (result.disposition === "failed") {
        job.state.possibleCharge ||= record.status === "sent";
        if (job.state.status !== "cancelled") job.state.status = "paused";
      }
      if (result.pause && job.state.status !== "cancelled") job.state.status = "paused";
      if (result.message) job.state.message = result.message;
      if (result.failure) job.state.lastFailure = result.failure;
      if (result.usage?.inputTokens !== null && result.usage?.inputTokens !== undefined && result.usage.outputTokens !== null) {
        job.state.usage ??= { inputTokens: 0, outputTokens: 0 };
        job.state.usage.inputTokens += result.usage.inputTokens;
        job.state.usage.outputTokens += result.usage.outputTokens;
      }
      if (["queued", "running"].includes(job.state.status) && !job.state.targets.some(t => t.status === "working" || t.status === "pending")) {
        job.state.status = job.state.targets.some(t => t.status === "failed") ? "paused" : "completed";
      }
      await client.query("UPDATE library_private.analysis_requests SET status=$1,finished_at=now() WHERE id=$2", [result.disposition, requestId]);
      await persist(client, job);
      return { more: ["queued", "running"].includes(job.state.status) };
    });
  }
  /** One durable step performs at most one model request, and never returns content or credentials. */
  async function processNext(jobId: string): Promise<{ more: boolean }> {
    const ownerId = owner();
    authorize(ownerId);
    let reserved: Awaited<ReturnType<typeof reserve>>;
    try { reserved = await reserve(jobId, ownerId); }
    catch (error) {
      if (error instanceof LibraryInputError && error.status === 404) return { more: false };
      throw new Error("Analysis storage is temporarily unavailable.");
    }
    const claim = reserved.claim;
    if (!claim) return { more: reserved.more };
    let sent = false;
    try {
      const current = await deps.revalidate({ batchId: claim.batchId, targets: claim.targets }, ownerId);
      const available = new Set(current.targets.map(t => t.id));
      const ignoredIds = claim.targets.filter(t => !available.has(t.id)).map(t => t.id);
      if (["paused", "cancelled"].includes(current.batch.status)) {
        return await settle(jobId, claim.requestId, ownerId, { disposition: "cancelled", pause: true, message: "导入批次已暂停或取消，后续分析已停止。" });
      }
      if (!current.targets.length) return await settle(jobId, claim.requestId, ownerId, { disposition: "cancelled", ignoredIds });
      const result = await deps.send(ownerId, claim.version, current.targets, async () => {
        // Called after DNS resolution, immediately before the HTTPS request is created.
        if (!await markSent(jobId, claim.requestId, ownerId, current.targets)) throw new LibraryInputError("任务、候选或模型配置已变化，未发送内容已暂停。", 409);
        sent = true;
      });
      // Cancellation stops adoption of an in-flight result too; it cannot revoke an already sent request.
      const latest = await readJob(pool, jobId, ownerId);
      let appliedIds: string[] = [];
      if (latest.state.status !== "cancelled") {
        const revisions = new Map(current.targets.map(t => [t.id, t.groupRevision]));
        const applied = await deps.apply({ batchId: claim.batchId, analysisJobId: jobId, results: result.suggestions.map(suggestion => ({ id: suggestion.id, groupRevision: revisions.get(suggestion.id)!, suggestion })) }, ownerId);
        appliedIds = applied.appliedIds;
      }
      return await settle(jobId, claim.requestId, ownerId, { disposition: "succeeded", appliedIds, ignoredIds, usage: result.usage });
    } catch (error) {
      const failure = failureDiagnostic(error, sent);
      try {
        return await settle(jobId, claim.requestId, ownerId, sent
          ? { disposition: "failed", message: failureMessage(failure, sent), failure }
          : { disposition: "cancelled", pause: true, message: failureMessage(failure, sent), failure });
      } catch { throw new Error("Analysis outcome awaits recovery; no automatic model retry was performed."); }
    }
  }
  async function dispatchFailed(jobId: string, ownerId: string) {
    authorize(ownerId);
    return transaction(async client => {
      await lockOwner(client, ownerId);
      const job = await readJob(client, jobId, ownerId, true);
      if (job.state.status === "queued") {
        job.state.status = "paused";
        job.state.message = "后台任务暂时未能启动，发送范围已保存。点击继续可再次启动。";
        await persist(client, job);
      }
      return { job: view(job) };
    });
  }
  return { handle, preview, start, get, list, control, processNext, dispatchFailed };
}
