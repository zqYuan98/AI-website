"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ApiConfigView } from "@/lib/smart-api-types";
import type { AnalysisJobResult, AnalysisPreview, AnalysisRequest } from "@/lib/smart-analysis-types";
import type { SmartImportBatchContext, SmartImportSelection } from "@/lib/smart-import-types";
import { ManagerDialog } from "./manager-primitives";
import { SmartFeedback } from "./smart-import-feedback";
import { smartError, smartErrorStatus, smartRequest } from "./smart-api";
import { analysisOverview } from "./smart-analysis-state";
import { useSmartAnalysis } from "./use-smart-analysis";
import { AnalysisJobCard } from "./smart-analysis-job";
import styles from "./smart-import.module.css";
import aiStyles from "./smart-analysis.module.css";

export function SmartImportAI({ context, refreshVersion, onResults, onViewResults, selectedIds = [] }: { context: SmartImportBatchContext; refreshVersion: number; onResults: () => void; onViewResults: () => void; selectedIds?: string[] }) {
  const { config, jobs, loading, failure, refresh } = useSmartAnalysis(context.batch.id, refreshVersion, onResults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [status, setStatus] = useState(0);
  const [analysis, setAnalysis] = useState<{ context: SmartImportBatchContext; ids: string[]; limit?: 5 } | null>(null);
  const pending = context.batch.summary.resultCounts.review;
  const scopeCount = pending || selectedIds.length;
  const { active, latest, history, hasSuggestions } = analysisOverview(jobs ?? [], config);
  const settingsHref = `/tools/manage/settings?returnTo=${encodeURIComponent(`/tools/manage/imports/${context.batch.id}`)}`;
  const canPrepare = !busy && !loading && !failure.message && Boolean(config?.enabled) && !active && !["paused", "cancelled"].includes(context.batch.status);
  async function prepare(useSelected = false, limit?: 5) {
    if (!canPrepare) return;
    setBusy(true); setError(""); setStatus(0);
    try {
      if (useSelected || !pending) { setAnalysis({ context, ids: [...selectedIds], limit }); return; }
      const selection = await smartRequest<SmartImportSelection>("imports", { action: "select", batchId: context.batch.id, batchRevision: context.batchRevision, filters: { resultStatus: "review" } });
      if (!selection.groupIds.length) { onResults(); return; }
      setAnalysis({ context: selection, ids: selection.groupIds, limit });
    } catch (failure) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); }
    finally { setBusy(false); }
  }
  const taskTitle = latest?.status === "completed" ? `本次整理完成，已保留 ${latest.succeeded} 条 AI 建议` : latest?.status === "running" ? "AI 正在整理这批资源" : latest?.status === "queued" ? "任务已提交，等待开始整理" : latest?.status === "paused" ? "AI 整理已暂停，请查看下方原因" : latest?.status === "failed" ? "AI 整理需要处理，请查看下方原因" : "上次整理已取消，可以重新选择范围";
  const title = loading ? "正在读取 AI 状态…" : failure.message ? "暂时无法读取 AI 状态" : !config?.enabled ? "连接模型后，AI 可以帮你补充资料" : latest ? taskTitle : history.length ? "新连接已就绪，先试少量资源" : "AI 已就绪，先试少量资源";
  return <section className={aiStyles.panel} aria-label="AI 整理">
    <div className={aiStyles.header}>
      <div className={aiStyles.eyebrow}><strong>✧ AI 整理</strong><button type="button" className={styles.textLink} onClick={refresh}>刷新进度</button><Link href={settingsHref}>AI 连接设置 ↗</Link></div>
      <h2>{title}</h2>
      <p>{config?.enabled ? `当前模型：${config.settings.model} · ${config.settings.name}` : "去重和规则分类已完成。连接模型后，可以进一步建议分类、标签和简介。"}</p>
      <div className={aiStyles.actions}>
        {!loading && config && !config.enabled ? <Link href={settingsHref} className={styles.primaryButton}>设置并启用 AI</Link> : !active ? <>
          <button type="button" className={styles.primaryButton} disabled={!canPrepare || !scopeCount} onClick={() => void prepare(false, 5)}>{busy ? "正在准备…" : "先试最多 5 个资源"}</button>
          <button type="button" className={styles.secondaryButton} disabled={!canPrepare || !scopeCount} onClick={() => void prepare()}>{pending ? `整理待确认的 ${pending} 个` : `补充已选的 ${selectedIds.length} 个`}</button>
          {pending > 0 && selectedIds.length > 0 ? <button type="button" className={styles.textLink} disabled={!canPrepare} onClick={() => void prepare(true)}>补充已选的 {selectedIds.length} 个</button> : null}
        </> : null}
        {hasSuggestions ? <button type="button" className={styles.secondaryButton} onClick={onViewResults}>查看 AI 建议 ↓</button> : null}
      </div>
      {!active ? <p>{pending ? `先从 ${pending} 个待确认资源中试用；也可单独补充已选的 ${selectedIds.length} 个。` : selectedIds.length ? `为已选的 ${selectedIds.length} 个资源补充分类、标签和简介。` : "先在下方选中资源，再用 AI 补充资料。"}</p> : null}
      {!active && config?.enabled ? <p className={aiStyles.help}>先预览实际发送数量，确认后才调用模型。AI 建议不会自动加入收藏。</p> : null}
    </div>
    <div className={aiStyles.feedback}><SmartFeedback error={failure.message || error} status={failure.message ? failure.status : status} onRefresh={() => { setError(""); refresh(); onResults(); }} /></div>
    {latest ? <AnalysisJobCard key={latest.id} job={latest} config={config} onChanged={refresh} onViewResults={onViewResults} settingsHref={settingsHref} activeJobId={active?.id} /> : null}
    {active && active.id !== latest?.id ? <AnalysisJobCard key={active.id} job={active} config={config} onChanged={refresh} onViewResults={onViewResults} settingsHref={settingsHref} activeJobId={active?.id} /> : null}
    {history.some(job => job.id !== active?.id) ? <><p className={aiStyles.historyNote}>{!latest ? "下方是旧连接的任务记录。当前连接尚未为这批资源生成建议，可从上方先试 5 个开始。" : "以前的任务记录保留在下方。"}</p><details className={aiStyles.history}><summary>查看以前的任务 · {history.filter(job => job.id !== active?.id).length} 次</summary>{history.filter(job => job.id !== active?.id).map(job => <AnalysisJobCard key={job.id} job={job} config={config} onChanged={refresh} onViewResults={onViewResults} settingsHref={settingsHref} activeJobId={active?.id} />)}</details></> : null}
    {analysis ? <SmartImportAnalysis context={analysis.context} groupIds={analysis.ids} limit={analysis.limit} onClose={() => setAnalysis(null)} onStarted={() => { refresh(); onResults(); }} /> : null}
  </section>;
}

export function SmartImportAnalysis({ context, groupIds, limit, onClose, onStarted }: { context: SmartImportBatchContext; groupIds: string[]; limit?: 5; onClose: () => void; onStarted: () => void }) {
  const [snapshot] = useState(context); const [scope, setScope] = useState(() => [...groupIds]);
  const [config, setConfig] = useState<ApiConfigView | null>(null); const [preview, setPreview] = useState<AnalysisPreview | null>(null); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [status, setStatus] = useState(0); const [submitted, setSubmitted] = useState(false);
  const attempt = useRef<Extract<AnalysisRequest, { action: "start" }> | null>(null);
  useEffect(() => { const controller = new AbortController(); smartRequest<ApiConfigView>("smart-settings", { action: "read" }, controller.signal).then(value => setConfig(value)).catch(failure => { if (!controller.signal.aborted) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, []);
  useEffect(() => {
    if (!config?.enabled || !scope.length) return; const controller = new AbortController();
    const payload: AnalysisRequest = { action: "preview", batchId: snapshot.batch.id, batchRevision: snapshot.batchRevision, groupIds: scope, configVersion: config.version, ...(limit ? { limit } : {}) };
    smartRequest<AnalysisPreview>("analysis", payload, controller.signal).then(value => setPreview(value)).catch(failure => { if (!controller.signal.aborted) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [config, snapshot, scope, limit]);
  function remove(id: string) { if (busy || attempt.current) return; const next = (limit && preview ? preview.targets.map(target => target.id) : scope).filter(value => value !== id); setBusy(next.length > 0); setPreview(null); setError(""); setScope(next); setPage(1); }
  async function start() {
    if (!preview || busy || !preview.targets.length) return; setBusy(true); setError("");
    const payload = attempt.current ?? { action: "start" as const, confirmation: preview.confirmation, requestId: crypto.randomUUID() }; attempt.current = payload; setSubmitted(true);
    try { await smartRequest<AnalysisJobResult>("analysis", payload); onStarted(); onClose(); } catch (failure) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } finally { setBusy(false); }
  }
  let host = ""; try { host = new URL(preview?.config.baseUrl || "").host; } catch { /* Empty preview. */ }
  return <ManagerDialog title={preview ? `让 AI 整理这 ${preview.targets.length} 个资源？` : "准备 AI 整理范围"} description="AI 会补充分类、标签和简介。只发送下方标题、主域名和随机编号，不发送完整链接、来源文件夹及私人备注。" onClose={onClose} busy={busy} wide><div className={styles.dialogBody}>
    {loading || (config?.enabled && scope.length > 0 && !preview && !error) ? <p className={styles.loading} role="status">正在生成可核对的发送清单…</p> : null}
    {!scope.length ? <p className={styles.notice}>已排除全部候选，本次发送 0 项。可以返回工作区重新选择。</p> : null}
    {config && !config.enabled ? <div className={styles.empty}><h3>外部模型尚未启用</h3><p>规则建议和手工整理可以直接使用。连接通过测试并启用后，再回来分析选中候选。</p><Link href={`/tools/manage/settings?returnTo=${encodeURIComponent(`/tools/manage/imports/${snapshot.batch.id}`)}`} className={styles.primaryButton}>前往 AI 连接设置</Link></div> : null}
    {preview ? <><dl className={styles.definitionList}><dt>目标服务</dt><dd>{preview.config.name} · {host}</dd><dt>模型</dt><dd>{preview.config.model}</dd><dt>本次范围</dt><dd>{preview.targets.length} 个资源</dd><dt>费用估算</dt><dd>{preview.estimatedCost === null ? "费用未知，可能产生调用费用" : preview.estimatedCost.toLocaleString("zh-CN", { maximumFractionDigits: 6 })}{preview.estimatedBudget !== null ? ` · 估算预算上限 ${preview.estimatedBudget}` : ""}</dd></dl>
      <p className={styles.notice}>{limit ? "本次只试少量资源，其余资源尚未发送。" : ""}返回后，点击“查看 AI 建议”检查分类、标签和简介；人工修改会保留。最后点击“加入我的收藏”才会保存到收藏库。</p>
      <details className={styles.compactDetails}><summary>查看发送清单 · {preview.targets.length} 个资源，可逐条排除</summary><ul className={styles.sendList}>{preview.targets.slice((page - 1) * 50, page * 50).map(item => <li key={item.id}><div><strong>{item.title}</strong><span>{item.domain}</span></div><button type="button" className={styles.textLink} disabled={busy || submitted} onClick={() => remove(item.id)} aria-label={`不发送 ${item.title}`}>不发送</button></li>)}</ul>
      <div className={styles.pagination}><button type="button" className={styles.secondaryButton} disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} / {Math.max(1, Math.ceil(preview.targets.length / 50))} 页</span><button type="button" className={styles.secondaryButton} disabled={page * 50 >= preview.targets.length} onClick={() => setPage(value => value + 1)}>下一页</button></div>
      </details><details className={styles.compactDetails}><summary>请求地址与用量详情</summary><p className={styles.help}>{preview.config.baseUrl.replace(/\/+$/, "")}/chat/completions</p><p className={styles.help}>预计 {preview.estimatedRequests} 次请求；每次最多 {preview.limits.batchSize} 条，最多 {preview.limits.maxRequests} 次，同时 {preview.limits.concurrency} 次，每次最多 {preview.limits.maxOutputTokens} 输出 token。费用估算不等于最终账单。</p></details>
      {preview.excluded.length ? <details className={styles.compactDetails}><summary>{preview.excluded.length} 项未纳入发送</summary><ul className={styles.reportList}>{preview.excluded.slice(0, 50).map(item => <li key={item.id}><span>{item.reason}</span></li>)}</ul>{preview.excluded.length > 50 ? <p className={styles.help}>其余 {preview.excluded.length - 50} 项同样不发送，可缩小选择范围查看。</p> : null}</details> : null}
    </> : null}
    <SmartFeedback error={error} status={status} /><div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>返回，不发送</button>{config?.enabled ? <button type="button" className={styles.primaryButton} disabled={busy || !preview?.targets.length || status === 409} onClick={start}>{busy ? "正在核对…" : submitted ? "核对并继续启动" : `确认发送 ${preview?.targets.length ?? 0} 项并开始`}</button> : null}</div>
  </div></ManagerDialog>;
}
