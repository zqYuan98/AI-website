"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SmartImportBatchContext, SmartImportCommitPreview, SmartImportMutationResult, SmartImportRequest, SmartImportReceiptItem } from "@/lib/smart-import-types";
import { ManagerDialog } from "./manager-primitives";
import { SmartFeedback } from "./smart-import-feedback";
import { downloadSmartReport, SmartRequestError, smartError, smartErrorStatus, smartRequest } from "./smart-api";
import styles from "./smart-import.module.css";

const suggestionMode = "accept-preserving-manual" as const;

/** Mount after the owner confirms the displayed collection scope. */
export function SmartImportCommit({ context, groupIds, onClose, onChanged, onUndo }: {
  context: SmartImportBatchContext; groupIds: string[]; onClose: () => void;
  onChanged: (result: SmartImportBatchContext) => void; onUndo?: () => void;
}) {
  const [startContext] = useState(() => context);
  const [scope] = useState(() => [...groupIds]);
  const [preview, setPreview] = useState<SmartImportCommitPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(0);
  const [receipts, setReceipts] = useState<SmartImportReceiptItem[]>([]);
  const [remainingCount, setRemainingCount] = useState(scope.length);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pausePending, setPausePending] = useState(false);
  const pauseRequested = useRef(false);
  const pausedRef = useRef(false);
  const running = useRef(false);
  const lifecycle = useRef<AbortSignal | null>(null);
  const currentContext = useRef(context);
  const remaining = useRef<string[]>([]);
  const pendingAttempt = useRef<Extract<SmartImportRequest, { action: "commit" }> | null>(null);
  const changed = useRef(onChanged);
  useEffect(() => { changed.current = onChanged; }, [onChanged]);

  const run = useCallback(async (approved: SmartImportCommitPreview) => {
    if (running.current) return;
    running.current = true; setBusy(true); setStarted(true); setError(""); setErrorStatus(0);
    setPaused(false); setPausePending(false); pauseRequested.current = false;
    function applyResult(result: SmartImportMutationResult, committedIds: string[]) {
      currentContext.current = result;
      remaining.current = remaining.current.filter(id => !committedIds.includes(id));
      pendingAttempt.current = null;
      if (lifecycle.current?.aborted) return;
      changed.current(result);
      setReceipts(previous => [...previous.filter(item => !committedIds.includes(item.groupId)), ...result.receipt.items]);
      setRemainingCount(remaining.current.length);
    }
    try {
      if (pausedRef.current) {
        currentContext.current = await smartRequest<SmartImportBatchContext>("imports", { action: "resume", batchId: startContext.batch.id, batchRevision: currentContext.current.batchRevision });
        pausedRef.current = false; changed.current(currentContext.current);
      }
      // Reuse the exact receipt after an uncertain response, before checking new revisions.
      if (pendingAttempt.current && !lifecycle.current?.aborted) {
        const attempt = pendingAttempt.current;
        applyResult(await smartRequest<SmartImportMutationResult>("imports", attempt), attempt.groupIds);
      }
      const approvedPlans = new Map(approved.items.map(item => [item.groupId, item.planHash]));
      while (remaining.current.length && !pauseRequested.current && !lifecycle.current?.aborted) {
        const ids = remaining.current.slice(0, 100);
        const next = await smartRequest<SmartImportCommitPreview>("imports", { action: "commit-preview", batchId: startContext.batch.id, batchRevision: currentContext.current.batchRevision, groupIds: ids, suggestionMode });
        if (next.items.length !== ids.length || next.items.some(item => approvedPlans.get(item.groupId) !== item.planHash)) {
          throw new SmartRequestError("部分资源的分类或重复关系已变化。已保存的内容会保留，请返回列表查看剩余资源后再收藏。", 409);
        }
        if (lifecycle.current?.aborted) break;
        currentContext.current = next;
        const attempt: Extract<SmartImportRequest, { action: "commit" }> = { action: "commit", batchId: startContext.batch.id, batchRevision: next.batchRevision, libraryRevision: next.libraryRevision, confirmation: next.confirmation, requestId: crypto.randomUUID(), groupIds: ids, suggestionMode };
        pendingAttempt.current = attempt;
        applyResult(await smartRequest<SmartImportMutationResult>("imports", attempt), ids);
      }
      if (pauseRequested.current && remaining.current.length && !lifecycle.current?.aborted) {
        const result = await smartRequest<SmartImportBatchContext>("imports", { action: "pause", batchId: startContext.batch.id, batchRevision: currentContext.current.batchRevision });
        currentContext.current = result; changed.current(result); pausedRef.current = true; setPaused(true);
      }
    } catch (failure) {
      if (!lifecycle.current?.aborted) { setError(smartError(failure)); setErrorStatus(smartErrorStatus(failure)); }
    } finally {
      running.current = false;
      if (!lifecycle.current?.aborted) setBusy(false);
    }
  }, [startContext.batch.id]);

  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller.signal;
    smartRequest<SmartImportCommitPreview>("imports", { action: "commit-preview", batchId: startContext.batch.id, batchRevision: startContext.batchRevision, groupIds: scope, suggestionMode }, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        if (result.libraryRevision !== startContext.libraryRevision) {
          throw new SmartRequestError("收藏库已在其他页面更新，分类或重复关系可能改变。请返回列表核对后再收藏，本次尚未新增。", 409);
        }
        setPreview(result); currentContext.current = result;
        if (result.items.some(item => ["needs-review", "invalid"].includes(item.disposition))) {
          throw new SmartRequestError("所选资源中有内容需要重新确认。请返回列表处理后再收藏，本次尚未新增。", 409);
        }
        remaining.current = result.items.map(item => item.groupId); setRemainingCount(remaining.current.length);
        setLoading(false); void run(result);
      })
      .catch(failure => { if (!controller.signal.aborted) { setError(smartError(failure)); setErrorStatus(smartErrorStatus(failure)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [scope, startContext, run]);

  const created = receipts.filter(item => item.status === "created").length;
  const skipped = receipts.filter(item => ["skipped", "already-completed"].includes(item.status)).length;
  const failed = receipts.filter(item => ["failed", "needs-review"].includes(item.status)).length;
  const complete = started && remainingCount === 0 && !busy && !error;
  return <ManagerDialog title={complete ? `${created} 个资源，已经收好了` : error ? "进度已保留" : paused ? "已暂停收藏" : "正在加入我的收藏"} description="按列表中展示的分类保存，仅自己可见。" onClose={onClose} busy={busy || loading} wide><div className={styles.dialogBody}>
    {loading ? <p className={styles.loading} role="status">正在核对所选的 {scope.length} 个资源…</p> : null}
    {started ? <div className={styles.progressPanel} role="status"><strong>{busy ? `正在保存 ${scope.length - remainingCount} / ${scope.length} 个资源` : complete ? "本次收藏完成" : "已成功保存的内容不会丢失"}</strong><p>新增 {created} 个 · 已有或已处理 {skipped} 个 · 需处理 {failed} 个 · 尚余 {remainingCount} 个</p>{busy ? <progress aria-label="收藏保存进度" max={scope.length || 1} value={scope.length - remainingCount} /> : null}</div> : null}
    {complete ? <p className={styles.notice}>未选择和需要确认的资源仍保留在本批，可以稍后继续整理。</p> : <p className={styles.help}>暂停后可继续。关闭页面会保留已保存的资源，剩余内容需要返回列表再次确认。</p>}
    <SmartFeedback error={error} status={errorStatus} />
    {receipts.length ? <details className={styles.compactDetails}><summary>查看本次处理详情</summary><p className={styles.help}>收藏范围：{scope.length} 个资源，包含其他页的选择。</p><button type="button" className={styles.textLink} onClick={() => downloadSmartReport({ batchId: startContext.batch.id, receipts, remaining: remaining.current }, `import-result-${startContext.batch.id}.json`)}>下载处理报告</button></details> : null}
    <div className={styles.dialogActions}>{busy ? <button type="button" className={styles.secondaryButton} disabled={pausePending} onClick={() => { pauseRequested.current = true; setPausePending(true); }}>{pausePending ? "正在完成当前部分…" : "暂停保存"}</button> : <button type="button" className={styles.secondaryButton} disabled={loading} onClick={onClose}>{complete ? "继续整理剩余资源" : "返回列表"}</button>}
      {complete ? <Link className={styles.primaryButton} href={`/tools/manage?batchId=${encodeURIComponent(startContext.batch.id)}`}>查看我的收藏</Link> : started && !busy && !loading && preview && remainingCount > 0 && errorStatus !== 409 ? <button type="button" className={styles.primaryButton} onClick={() => void run(preview)}>继续保存剩余资源</button> : null}
    </div>{complete && created > 0 && onUndo ? <button type="button" className={styles.textLink} onClick={onUndo}>查看可撤回的本批收藏</button> : null}
  </div></ManagerDialog>;
}
