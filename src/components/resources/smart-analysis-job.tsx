"use client";

import Link from "next/link";
import { useState } from "react";
import type { AnalysisJob, AnalysisJobResult, AnalysisRequest } from "@/lib/smart-analysis-types";
import type { ApiConfigView } from "@/lib/smart-api-types";
import { ManagerDialog } from "./manager-primitives";
import { SmartFeedback } from "./smart-import-feedback";
import { smartDate, smartError, smartErrorStatus, smartRequest } from "./smart-api";
import { ANALYSIS_STATUS, usesCurrentConnection } from "./smart-analysis-state";
import styles from "./smart-import.module.css";
import aiStyles from "./smart-analysis.module.css";

export function AnalysisJobCard({ job, config, onChanged, onViewResults, settingsHref, activeJobId }: {
  job: AnalysisJob; config: ApiConfigView | null; onChanged: () => void; onViewResults: () => void; settingsHref: string; activeJobId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [status, setStatus] = useState(0);
  const [confirmation, setConfirmation] = useState<{ action: "retry" | "cancel"; job: AnalysisJob } | null>(null);
  const current = usesCurrentConnection(job, config);
  const active = job.status === "queued" || job.status === "running";
  const canResume = current && config?.enabled && (!activeJobId || activeJobId === job.id);
  function confirm(action: "retry" | "cancel") { setError(""); setStatus(0); setConfirmation({ action, job }); }
  async function control(action: "pause" | "resume" | "cancel", retryFailed = false, snapshot = job) {
    if (busy) return;
    setBusy(true); setError(""); setStatus(0);
    const payload: AnalysisRequest = action === "resume" ? { action, jobId: snapshot.id, revision: snapshot.revision, ...(retryFailed ? { retryFailed: true } : {}) } : { action, jobId: snapshot.id, revision: snapshot.revision };
    try { await smartRequest<AnalysisJobResult>("analysis", payload); setConfirmation(null); onChanged(); }
    catch (failure) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); }
    finally { setBusy(false); }
  }
  return <article className={`${aiStyles.job} ${job.failed || job.status === "paused" || job.status === "failed" ? aiStyles.attention : ""}`} aria-label={`${current ? "当前连接" : "旧连接"}的 AI 任务`}>
    <div className={aiStyles.jobTitle}><strong>{job.config.model} {current ? "" : "· 旧连接"}</strong><span className={styles.statusBadge}>{ANALYSIS_STATUS[job.status]}</span></div>
    {active ? <progress aria-label="AI 整理进度" max={job.total || 1} value={job.succeeded + job.ignored + job.failed} /> : null}
    <p aria-live={active ? "polite" : "off"}>已保留 {job.succeeded} 条建议 · 待处理 {job.pending} · 未采纳 {job.ignored} · 失败 {job.failed}</p>
    <p className={aiStyles.message}>{job.message || (job.status === "queued" ? "任务已提交，正在等待模型开始处理。进度会自动更新，可以离开此页后再回来。" : job.status === "running" ? "正在等待模型返回建议，进度会自动更新。" : job.status === "completed" ? job.succeeded ? "建议已显示在下方列表。查看后，再决定哪些加入收藏。" : "本次没有保留新的建议，请检查资源状态或查看任务说明。" : `最近更新：${smartDate(job.updatedAt)}`)}</p>
    {!current ? <p>这次任务绑定了以前的连接设置。要使用当前模型，请在上方重新选择范围并预览发送清单。</p> : !config?.enabled && !["completed", "cancelled"].includes(job.status) ? <p>当前连接已停用，先到连接设置检查并启用。</p> : null}
    {job.possibleCharge ? <p className={aiStyles.help}>已有请求可能产生费用；重试会再次发送失败项。</p> : null}
    {!confirmation ? <SmartFeedback error={error} status={status} onRefresh={onChanged} /> : null}
    <div className={aiStyles.actions}>
      {job.succeeded > 0 ? <button type="button" className={styles.secondaryButton} onClick={onViewResults}>查看 AI 建议 ↓</button> : null}
      {active ? <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void control("pause")}>暂停后续请求</button> : null}
      {canResume && ["paused", "failed"].includes(job.status) && job.pending > 0 ? <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void control("resume")}>继续未完成的整理</button> : null}
      {canResume && job.failed > 0 && !["running", "queued", "cancelled"].includes(job.status) ? <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => confirm("retry")}>重试失败的 {job.failed} 个</button> : null}
      {current && !config?.enabled ? <Link href={settingsHref} className={styles.secondaryButton}>检查 AI 连接</Link> : null}
      {!["completed", "cancelled"].includes(job.status) ? <button type="button" className={styles.textLink} disabled={busy} onClick={() => confirm("cancel")}>取消任务</button> : null}
    </div>
    <details className={styles.compactDetails}><summary>任务详情</summary><p>{job.config.name} · 共 {job.total} 个 · 已请求 {job.requests} 次 · {smartDate(job.updatedAt)}</p>{job.usage ? <p>服务商返回用量：输入 {job.usage.inputTokens} / 输出 {job.usage.outputTokens} token</p> : null}</details>
    {confirmation ? <ManagerDialog title={confirmation.action === "retry" ? `重新发送失败的 ${confirmation.job.failed} 个资源？` : "取消这次整理？"} description={confirmation.action === "retry" ? `仍发送给 ${confirmation.job.config.name} 的 ${confirmation.job.config.model}。部分失败请求可能已产生费用，重试可能重复计费；已成功的建议会保留。` : "停止后续请求。正在发送的请求可能仍会完成并产生费用，已有建议和人工决定会保留。"} onClose={() => setConfirmation(null)} busy={busy}><div className={styles.dialogBody}><SmartFeedback error={error} status={status} /><div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => { setConfirmation(null); onChanged(); }}>返回</button><button type="button" className={styles.primaryButton} disabled={busy || (confirmation.action === "retry" && !canResume) || status === 409} onClick={() => void control(confirmation.action === "retry" ? "resume" : "cancel", confirmation.action === "retry", confirmation.job)}>{busy ? "正在处理…" : confirmation.action === "retry" ? "确认可能计费并重试" : "确认取消任务"}</button></div></div></ManagerDialog> : null}
  </article>;
}
