"use client";

import { useEffect, useRef, useState } from "react";
import type { SmartImportBatchContext, SmartImportMutationResult, SmartImportRequest, SmartImportUndoPreview } from "@/lib/smart-import-types";
import { ManagerDialog } from "./manager-primitives";
import { SmartFeedback } from "./smart-import-feedback";
import { downloadSmartReport, smartError, smartErrorStatus, smartRequest } from "./smart-api";
import styles from "./smart-import.module.css";

export function SmartImportUndo({ context, onClose, onChanged }: { context: SmartImportBatchContext; onClose: () => void; onChanged: (value: SmartImportBatchContext) => void }) {
  const [snapshot] = useState(context); const [preview, setPreview] = useState<SmartImportUndoPreview | null>(null); const [selected, setSelected] = useState<Set<string>>(new Set()); const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [status, setStatus] = useState(0); const [result, setResult] = useState<SmartImportMutationResult | null>(null); const [submitted, setSubmitted] = useState(false);
  const attempt = useRef<Extract<SmartImportRequest, { action: "undo" }> | null>(null);
  useEffect(() => { const controller = new AbortController(); smartRequest<SmartImportUndoPreview>("imports", { action: "undo-preview", batchId: snapshot.batch.id, batchRevision: snapshot.batchRevision }, controller.signal).then(value => { setPreview(value); setSelected(new Set(value.defaultGroupIds)); }).catch(failure => { if (!controller.signal.aborted) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [snapshot]);
  async function confirm() {
    if (!preview || busy || !selected.size) return; setBusy(true); setError("");
    const payload = attempt.current ?? { action: "undo" as const, batchId: snapshot.batch.id, batchRevision: preview.batchRevision, libraryRevision: preview.libraryRevision, confirmation: preview.confirmation, requestId: crypto.randomUUID(), groupIds: [...selected], includeEditedResourceIds: preview.items.filter(item => item.disposition === "edited" && selected.has(item.groupId)).map(item => item.resourceId) }; attempt.current = payload; setSubmitted(true);
    try { const value = await smartRequest<SmartImportMutationResult>("imports", payload); setResult(value); onChanged(value); } catch (failure) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } finally { setBusy(false); }
  }
  return <ManagerDialog title="撤回本批私有新增" description="默认只撤回本批新建且未再编辑的私有资源。原有资源、当前公开候选与已发布资源会保留。后来编辑或设为常用的资源默认不选中。" onClose={onClose} busy={busy} wide><div className={styles.dialogBody}>
    {loading ? <p className={styles.loading}>正在检查可撤回范围…</p> : null}{result ? <div className={styles.success} role="status"><strong>撤回已完成</strong><p>已撤回 {result.receipt.items.filter(item => item.status === "undone").length} 条，本批来源与处理记录仍保留。</p><button type="button" className={styles.textLink} onClick={() => downloadSmartReport(result.receipt, `undo-${snapshot.batch.id}.json`)}>下载撤回报告</button></div> : preview ? <><p className={styles.notice}>后来编辑过的条目默认不选中。如要撤回，请逐条勾选并确认会移除修改后的资源。</p><ul className={styles.undoList}>{preview.items.slice((page - 1) * 50, page * 50).map(item => <li key={item.groupId}><label className={styles.checkLabel}><input type="checkbox" checked={selected.has(item.groupId)} disabled={busy || submitted || !["eligible", "edited"].includes(item.disposition)} onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(item.groupId); else next.delete(item.groupId); return next; })} /><span><strong>{item.name}</strong><small>{item.reason}{item.disposition === "edited" ? " · 勾选即确认连同后续修改一起撤回" : ""}</small></span></label></li>)}</ul><div className={styles.pagination}><button type="button" className={styles.secondaryButton} disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} / {Math.max(1, Math.ceil(preview.items.length / 50))} 页</span><button type="button" className={styles.secondaryButton} disabled={page * 50 >= preview.items.length} onClick={() => setPage(value => value + 1)}>下一页</button></div></> : null}
    <SmartFeedback error={error} status={status} /><div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>{result ? "完成" : "保留这些资源"}</button>{!result ? <button type="button" className={styles.dangerButton} disabled={busy || loading || !selected.size || status === 409} onClick={confirm}>{busy ? "正在撤回…" : `确认撤回 ${selected.size} 条`}</button> : null}</div>
  </div></ManagerDialog>;
}
