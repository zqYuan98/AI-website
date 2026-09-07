"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ApiConfigView } from "@/lib/smart-api-types";
import type { AnalysisJob, AnalysisJobResult, AnalysisPreview, AnalysisRequest } from "@/lib/smart-analysis-types";
import type { SmartImportBatchContext } from "@/lib/smart-import-types";
import { ManagerDialog } from "./manager-primitives";
import { SmartFeedback } from "./smart-import-feedback";
import { smartDate, smartError, smartErrorStatus, smartRequest } from "./smart-api";
import styles from "./smart-import.module.css";

const JOB_STATUS: Record<AnalysisJob["status"], string> = { queued: "等待开始", running: "正在分析", paused: "已暂停", completed: "分析完成", cancelled: "已取消", failed: "需要处理" };

export function SmartImportAnalysis({ context, groupIds, onClose, onStarted }: { context: SmartImportBatchContext; groupIds: string[]; onClose: () => void; onStarted: () => void }) {
  const [snapshot] = useState(context); const [scope, setScope] = useState(() => [...groupIds]);
  const [config, setConfig] = useState<ApiConfigView | null>(null); const [preview, setPreview] = useState<AnalysisPreview | null>(null); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [status, setStatus] = useState(0); const [submitted, setSubmitted] = useState(false);
  const attempt = useRef<Extract<AnalysisRequest, { action: "start" }> | null>(null);
  useEffect(() => { const controller = new AbortController(); smartRequest<ApiConfigView>("smart-settings", { action: "read" }, controller.signal).then(value => setConfig(value)).catch(failure => { if (!controller.signal.aborted) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, []);
  useEffect(() => {
    if (!config?.enabled || !scope.length) return; const controller = new AbortController();
    const payload: AnalysisRequest = { action: "preview", batchId: snapshot.batch.id, batchRevision: snapshot.batchRevision, groupIds: scope, configVersion: config.version };
    smartRequest<AnalysisPreview>("analysis", payload, controller.signal).then(value => setPreview(value)).catch(failure => { if (!controller.signal.aborted) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [config, snapshot, scope]);
  function remove(id: string) { if (busy || attempt.current) return; const next = scope.filter(value => value !== id); setBusy(next.length > 0); setPreview(null); setError(""); setScope(next); setPage(1); }
  async function start() {
    if (!preview || busy || !preview.targets.length) return; setBusy(true); setError("");
    const payload = attempt.current ?? { action: "start" as const, confirmation: preview.confirmation, requestId: crypto.randomUUID() }; attempt.current = payload; setSubmitted(true);
    try { await smartRequest<AnalysisJobResult>("analysis", payload); onStarted(); onClose(); } catch (failure) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } finally { setBusy(false); }
  }
  let host = ""; try { host = new URL(preview?.config.baseUrl || "").host; } catch { /* Empty preview. */ }
  return <ManagerDialog title="确认智能分析的发送范围" description="实际发送的内容仅为下方标题、主域名和随机编号。完整链接、路径、参数、来源文件夹和私人备注不会发送。" onClose={onClose} busy={busy} wide><div className={styles.dialogBody}>
    {loading || (config?.enabled && scope.length > 0 && !preview && !error) ? <p className={styles.loading} role="status">正在生成可核对的发送清单…</p> : null}
    {!scope.length ? <p className={styles.notice}>已排除全部候选，本次发送 0 项。可以返回工作区重新选择。</p> : null}
    {config && !config.enabled ? <div className={styles.empty}><h3>外部模型尚未启用</h3><p>规则建议和手工整理可以直接使用。连接通过测试并启用后，再回来分析选中候选。</p><Link href="/tools/manage/settings" className={styles.primaryButton}>前往智能筛选设置</Link></div> : null}
    {preview ? <><dl className={styles.definitionList}><dt>目标服务</dt><dd>{preview.config.name} · {host}</dd><dt>请求地址</dt><dd>{preview.config.baseUrl.replace(/\/+$/, "")}/chat/completions</dd><dt>模型</dt><dd>{preview.config.model}</dd><dt>本次范围</dt><dd>{preview.targets.length} 个候选，预计 {preview.estimatedRequests} 次请求</dd><dt>用量上限</dt><dd>每次 {preview.limits.batchSize} 条 · 最多 {preview.limits.maxRequests} 次请求 · 同时 {preview.limits.concurrency} 次 · 每次最多 {preview.limits.maxOutputTokens} 输出 token</dd><dt>费用估算</dt><dd>{preview.estimatedCost === null ? "费用未知" : preview.estimatedCost.toLocaleString("zh-CN", { maximumFractionDigits: 6 })}{preview.estimatedBudget !== null ? ` · 估算预算上限 ${preview.estimatedBudget}` : ""}</dd></dl>
      <p className={styles.notice}>点击开始后会向上述服务发送这些内容，并可能产生费用。估算不等于最终账单，建议需由你确认后才会采用。</p>
      <div className={styles.sectionTitle}><h3>实际发送清单</h3><span className={styles.help}>可逐条排除 · 每页 50 条</span></div><ul className={styles.sendList}>{preview.targets.slice((page - 1) * 50, page * 50).map(item => <li key={item.id}><div><strong>{item.title}</strong><span>{item.domain}</span></div><button type="button" className={styles.textLink} disabled={busy || submitted} onClick={() => remove(item.id)} aria-label={`不发送 ${item.title}`}>不发送</button></li>)}</ul>
      <div className={styles.pagination}><button type="button" className={styles.secondaryButton} disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} / {Math.max(1, Math.ceil(preview.targets.length / 50))} 页</span><button type="button" className={styles.secondaryButton} disabled={page * 50 >= preview.targets.length} onClick={() => setPage(value => value + 1)}>下一页</button></div>
      {preview.excluded.length ? <details className={styles.compactDetails}><summary>{preview.excluded.length} 项未纳入发送</summary><ul className={styles.reportList}>{preview.excluded.slice(0, 50).map(item => <li key={item.id}><span>{item.reason}</span></li>)}</ul>{preview.excluded.length > 50 ? <p className={styles.help}>其余 {preview.excluded.length - 50} 项同样不发送，可缩小选择范围查看。</p> : null}</details> : null}
    </> : null}
    <SmartFeedback error={error} status={status} /><div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>返回，不发送</button>{config?.enabled ? <button type="button" className={styles.primaryButton} disabled={busy || !preview?.targets.length || status === 409} onClick={start}>{busy ? "正在核对…" : submitted ? "核对并继续启动" : `确认发送 ${preview?.targets.length ?? 0} 项并开始`}</button> : null}</div>
  </div></ManagerDialog>;
}

export function SmartAnalysisJobs({ batchId, refreshVersion, onResults }: { batchId: string; refreshVersion: number; onResults: () => void }) {
  const [jobs, setJobs] = useState<AnalysisJob[]>([]); const [version, setVersion] = useState(0); const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [status, setStatus] = useState(0);
  const [confirmation, setConfirmation] = useState<{ job: AnalysisJob; action: "retry" | "cancel" } | null>(null);
  const previousProgress = useRef(""); const callback = useRef(onResults);
  useEffect(() => { callback.current = onResults; }, [onResults]);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() { try { const result = await smartRequest<{ jobs: AnalysisJob[] }>("analysis", { action: "list", batchId }, controller.signal); if (controller.signal.aborted) return; setJobs(result.jobs); const progress = result.jobs.map(job => `${job.id}:${job.succeeded}:${job.ignored}`).join("|"); if (previousProgress.current && previousProgress.current !== progress) callback.current(); previousProgress.current = progress; if (result.jobs.some(job => ["running", "queued"].includes(job.status))) timer = setTimeout(load, 5000); } catch (failure) { if (!controller.signal.aborted) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } } }
    void load(); return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [batchId, refreshVersion, version]);
  async function control(job: AnalysisJob, action: "pause" | "resume" | "cancel", retryFailed = false) {
    if (busy) return; setBusy(job.id); setError("");
    const payload: AnalysisRequest = action === "resume" ? { action, jobId: job.id, revision: job.revision, ...(retryFailed ? { retryFailed: true } : {}) } : { action, jobId: job.id, revision: job.revision };
    try { const result = await smartRequest<AnalysisJobResult>("analysis", payload); setJobs(previous => previous.map(value => value.id === job.id ? result.job : value)); setConfirmation(null); setVersion(value => value + 1); callback.current(); } catch (failure) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } finally { setBusy(""); }
  }
  if (!jobs.length && !error) return null;
  return <section className={styles.jobsPanel} aria-label="智能分析进度"><div className={styles.sectionTitle}><h2>智能分析进度</h2><span className={styles.help}>离开页面后保留进度</span></div>{!confirmation ? <SmartFeedback error={error} status={status} /> : null}<div className={styles.jobList}>{jobs.map(job => <article key={job.id}><div className={styles.sectionTitle}><strong>{job.config.name} · {job.config.model}</strong><span className={styles.statusBadge}>{JOB_STATUS[job.status]}</span></div><p>已返回 {job.succeeded} / {job.total} · 待处理 {job.pending} · 已忽略 {job.ignored} · 失败 {job.failed} · 已请求 {job.requests} 次</p><p className={styles.help}>{job.message || `更新于 ${smartDate(job.updatedAt)}`}{job.possibleCharge ? " · 部分请求可能已经计费" : ""}</p>{job.usage ? <p className={styles.help}>服务商已返回用量：输入 {job.usage.inputTokens} / 输出 {job.usage.outputTokens} token</p> : null}<div className={styles.inlineActions}>{["running", "queued"].includes(job.status) ? <button type="button" className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => void control(job, "pause")}>暂停后续请求</button> : null}{["paused", "failed"].includes(job.status) && job.pending ? <button type="button" className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => void control(job, "resume")}>继续未完成的分析</button> : null}{job.failed && !["running", "queued", "cancelled"].includes(job.status) ? <button type="button" className={styles.textLink} disabled={Boolean(busy)} onClick={() => setConfirmation({ job, action: "retry" })}>重试失败项</button> : null}{!["completed", "cancelled"].includes(job.status) ? <button type="button" className={styles.textLink} disabled={Boolean(busy)} onClick={() => setConfirmation({ job, action: "cancel" })}>取消此任务</button> : null}</div></article>)}</div>{confirmation ? <ManagerDialog title={confirmation.action === "retry" ? "重新请求失败项？" : "取消这次分析？"} description={confirmation.action === "retry" ? "部分失败请求可能已产生费用。重新发送可能重复计费；已成功的建议会保留。配置变更后需返回工作区重新预览。" : "停止后续请求。正在发送的请求可能仍会完成并产生费用，已有建议和人工决定会保留。"} onClose={() => setConfirmation(null)} busy={Boolean(busy)}><div className={styles.dialogBody}><SmartFeedback error={error} status={status} /><div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => setConfirmation(null)}>返回</button><button type="button" className={styles.primaryButton} disabled={Boolean(busy)} onClick={() => void control(confirmation.job, confirmation.action === "retry" ? "resume" : "cancel", confirmation.action === "retry")}>{busy ? "正在处理…" : confirmation.action === "retry" ? "确认可能计费并重试" : "确认取消分析"}</button></div></div></ManagerDialog> : null}</section>;
}
