"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SmartImportBatchContext, SmartImportCommitPreview, SmartImportMutationResult, SmartImportRequest, SmartImportReceiptItem } from "@/lib/smart-import-types";
import { ManagerDialog } from "./manager-primitives";
import { SmartFeedback } from "./smart-import-feedback";
import { downloadSmartReport, SmartRequestError, smartError, smartErrorStatus, smartRequest } from "./smart-api";
import styles from "./smart-import.module.css";

export function SmartImportCommit({ context, groupIds, onClose, onChanged }: { context: SmartImportBatchContext; groupIds: string[]; onClose: () => void; onChanged: (result: SmartImportBatchContext) => void }) {
  const [startContext] = useState(() => context);
  const [scope] = useState(() => [...groupIds]);
  const [preview, setPreview] = useState<SmartImportCommitPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(0);
  const [receipts, setReceipts] = useState<SmartImportReceiptItem[]>([]);
  const [remainingCount, setRemainingCount] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pausePending, setPausePending] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const pauseRequested = useRef(false);
  const currentContext = useRef(context);
  const remaining = useRef<string[]>([]);
  const pendingAttempt = useRef<Extract<SmartImportRequest, { action: "commit" }> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    smartRequest<SmartImportCommitPreview>("imports", { action: "commit-preview", batchId: startContext.batch.id, batchRevision: startContext.batchRevision, groupIds: scope }, controller.signal)
      .then(result => { setPreview(result); currentContext.current = result; remaining.current = result.items.filter(item => ["create", "skip-existing", "already-completed"].includes(item.disposition)).map(item => item.groupId); setRemainingCount(remaining.current.length); })
      .catch(failure => { if (!controller.signal.aborted) { setError(smartError(failure)); setErrorStatus(smartErrorStatus(failure)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [scope, startContext]);

  function applyResult(result: SmartImportMutationResult, committedIds: string[]) {
    currentContext.current = result; onChanged(result);
    setReceipts(previous => [...previous.filter(item => !committedIds.includes(item.groupId)), ...result.receipt.items]);
    remaining.current = remaining.current.filter(id => !committedIds.includes(id));
    setRemainingCount(remaining.current.length); pendingAttempt.current = null;
  }
  async function run() {
    if (!preview || busy) return;
    setBusy(true); setError(""); setPaused(false); setPausePending(false); pauseRequested.current = false;
    try {
      if (paused) {
        currentContext.current = await smartRequest<SmartImportBatchContext>("imports", { action: "resume", batchId: context.batch.id, batchRevision: currentContext.current.batchRevision });
        onChanged(currentContext.current);
      }
      if (!started) {
        const createIds = preview.items.filter(item => item.disposition === "create").map(item => item.groupId);
        if (createIds.length) {
          currentContext.current = await smartRequest<SmartImportBatchContext>("imports", { action: "decide", batchId: context.batch.id, batchRevision: currentContext.current.batchRevision, groupIds: createIds, decision: "keep" });
          onChanged(currentContext.current);
        }
        setStarted(true);
      }
      if (pendingAttempt.current) {
        const attempt = pendingAttempt.current;
        applyResult(await smartRequest<SmartImportMutationResult>("imports", attempt), attempt.groupIds);
      }
      const approvedPlans = new Map(preview.items.map(item => [item.groupId, item.planHash]));
      while (remaining.current.length && !pauseRequested.current) {
        const ids = remaining.current.slice(0, 100);
        const next = await smartRequest<SmartImportCommitPreview>("imports", { action: "commit-preview", batchId: context.batch.id, batchRevision: currentContext.current.batchRevision, groupIds: ids });
        if (next.items.some(item => approvedPlans.get(item.groupId) !== item.planHash)) throw new SmartRequestError("部分候选内容或重复关系发生变化。已成功入库的部分会保留，请关闭此窗口后重新预览剩余条目。", 409);
        currentContext.current = next;
        const attempt: Extract<SmartImportRequest, { action: "commit" }> = { action: "commit", batchId: context.batch.id, batchRevision: next.batchRevision, libraryRevision: next.libraryRevision, confirmation: next.confirmation, requestId: crypto.randomUUID(), groupIds: ids };
        pendingAttempt.current = attempt;
        applyResult(await smartRequest<SmartImportMutationResult>("imports", attempt), ids);
      }
      if (pauseRequested.current && remaining.current.length) {
        const result = await smartRequest<SmartImportBatchContext>("imports", { action: "pause", batchId: context.batch.id, batchRevision: currentContext.current.batchRevision });
        currentContext.current = result; onChanged(result); setPaused(true);
      }
    } catch (failure) { setError(smartError(failure)); setErrorStatus(smartErrorStatus(failure)); }
    finally { setBusy(false); }
  }
  const created = receipts.filter(item => item.status === "created").length;
  const skipped = receipts.filter(item => ["skipped", "already-completed"].includes(item.status)).length;
  const failed = receipts.filter(item => ["failed", "needs-review"].includes(item.status)).length;
  const blocked = preview?.items.filter(item => ["needs-review", "invalid"].includes(item.disposition)) ?? [];
  const complete = started && remainingCount === 0 && !busy;
  return <ManagerDialog title={complete ? "本次处理结果" : "确认私有入库"} description="仅处理明确选中的去重组。新增资源仅自己可见，不会成为公开候选、精选或常用。" onClose={onClose} busy={busy} wide><div className={styles.dialogBody}>
    {loading ? <p className={styles.loading} role="status">正在核对所选范围与最新重复关系…</p> : null}
    {preview ? <><div className={styles.summaryGrid}><div><strong>{preview.items.filter(item => item.disposition === "create").length}</strong><span>计划新增</span></div><div><strong>{preview.items.filter(item => item.disposition === "skip-existing").length}</strong><span>已有，跳过</span></div><div><strong>{blocked.length}</strong><span>需先处理</span></div></div>
      <p className={styles.help}>所选 {scope.length} 个去重组；每次最多提交 100 组。确认后会保存“保留”决定，暂停或关闭后可从批次继续。</p>
      {!started ? <details className={styles.compactDetails}><summary>查看全部 {preview.items.length} 个处理结果</summary><ul className={styles.reportList}>{preview.items.slice((previewPage - 1) * 50, previewPage * 50).map(item => <li key={item.groupId}><strong>{item.name}</strong><span>{item.disposition === "create" ? "私有新增" : item.disposition === "skip-existing" ? "已有，跳过新增" : item.disposition === "already-completed" ? "此前已处理" : item.reason || "需要进一步确认"}</span></li>)}</ul><div className={styles.pagination}><button type="button" className={styles.secondaryButton} disabled={previewPage <= 1} onClick={() => setPreviewPage(value => value - 1)}>上一页</button><span>第 {previewPage} / {Math.max(1, Math.ceil(preview.items.length / 50))} 页</span><button type="button" className={styles.secondaryButton} disabled={previewPage * 50 >= preview.items.length} onClick={() => setPreviewPage(value => value + 1)}>下一页</button></div></details> : <div className={styles.progressPanel} role="status"><strong>{busy ? "正在分批入库…" : paused ? "已暂停，决定已保存" : complete ? "处理结果" : "进度已保存"}</strong><p>已新增 {created} · 重复跳过 {skipped} · 需处理或失败 {failed} · 尚余 {remainingCount} 组</p></div>}
      {blocked.length ? <p className={styles.notice}>{blocked.length} 个候选需要先补充确认，本次不会入库；它们仍保留在导入工作区。</p> : null}
    </> : null}
    <SmartFeedback error={error} status={errorStatus} />
    {receipts.length ? <button type="button" className={styles.textLink} onClick={() => downloadSmartReport({ batchId: context.batch.id, receipts, remaining: remaining.current }, `import-result-${context.batch.id}.json`)}>下载本次处理报告</button> : null}
    <div className={styles.dialogActions}>{busy ? <button type="button" className={styles.secondaryButton} onClick={() => { pauseRequested.current = true; setPausePending(true); }}>{pausePending ? "将在本组完成后暂停" : "暂停后续入库"}</button> : <button type="button" className={styles.secondaryButton} onClick={onClose}>{complete ? "继续整理本批" : "返回工作区"}</button>}{complete ? <Link className={styles.primaryButton} href={`/tools/manage?batchId=${encodeURIComponent(context.batch.id)}`}>查看本批收藏</Link> : <button type="button" className={styles.primaryButton} disabled={busy || loading || !preview || !remainingCount || errorStatus === 409} onClick={run}>{busy ? "正在处理…" : started ? "继续未完成的入库" : "确认保留并私有入库"}</button>}</div>
  </div></ManagerDialog>;
}
