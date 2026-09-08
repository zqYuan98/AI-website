"use client";

import { useEffect, useRef, useState } from "react";
import type { SmartImportGroupPage, SmartImportMutationResult } from "@/lib/smart-import-types";
import { ManagerDialog } from "./manager-primitives";
import { SmartFeedback } from "./smart-import-feedback";
import { smartError, smartErrorStatus, smartRequest } from "./smart-api";
import styles from "./smart-import.module.css";

/** Load the real collection before confirmation; retries keep the same immutable request. */
export function SmartImportCollection({ batchId, groupId, mode, onClose, onChanged }: {
  batchId: string; groupId: string; mode: "archive" | "restore"; onClose: () => void;
  onChanged: (result: SmartImportMutationResult, mode: "archive" | "restore") => void;
}) {
  const [snapshot, setSnapshot] = useState<SmartImportGroupPage | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(0);
  const requestId = useRef("");
  const submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    smartRequest<SmartImportGroupPage>("imports", { action: "group", batchId, groupId }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setSnapshot(result); })
      .catch(failure => { if (!controller.signal.aborted) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [batchId, groupId, version]);
  function refresh() {
    setSnapshot(null); setLoading(true); setError(""); setStatus(0); requestId.current = "";
    setVersion(value => value + 1);
  }
  const collection = snapshot?.group.currentCollection;
  const restoring = mode === "restore";
  const actionable = collection?.state === (restoring ? "archived" : "active");
  async function save() {
    if (!snapshot || !collection?.resource || !actionable || loading || submitting.current || status === 409) return;
    submitting.current = true; setBusy(true); setError("");
    requestId.current ||= crypto.randomUUID();
    try {
      const result = await smartRequest<SmartImportMutationResult>("imports", {
        action: "collection", mode, batchId, groupId, expectedResourceId: collection.resourceId,
        batchRevision: snapshot.batchRevision, libraryRevision: snapshot.libraryRevision, requestId: requestId.current,
      });
      onChanged(result, mode); onClose();
    } catch (failure) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <ManagerDialog title={loading ? "正在核对收藏…" : restoring ? "恢复这条收藏？" : "移出这条收藏？"}
    description={restoring ? "恢复为已整理，仅自己可见。" : "移出后保留在“已移出”中，可以随时恢复。"} onClose={onClose} busy={busy}>
    <div className={styles.dialogBody}>
      {loading ? <p role="status">正在读取这条收藏的最新内容…</p> : collection?.resource ? <>
        <div className={styles.detailLead}><strong>{collection.resource.name}</strong><p className={styles.fullUrl}>{collection.resource.url}</p>{collection.resource.description ? <p>{collection.resource.description}</p> : null}<span className={styles.statusBadge}>{collection.resource.category}</span></div>
        {!actionable ? <p className={styles.notice}>{restoring ? "这条收藏已经恢复，无需再次操作。" : "这条收藏已经移出，无需再次操作。"}</p> : null}
        {snapshot && ["linked", "merged", "restored"].includes(snapshot.group.outcome?.kind ?? "") ? <p className={styles.notice}>这条导入记录关联了已有收藏。此操作影响整条收藏及所有关联记录。</p> : null}
        {collection.publishedInSnapshot ? <p className={styles.notice}>网站仍在展示这条资源，需另行发布更新。你可以在收藏库的“发布到网站”中核对公开内容。</p> : null}
      </> : !error ? <p className={styles.notice}>这条记录对应的收藏已不存在，无法在这里恢复。原始导入来源仍然保留。</p> : null}
      <SmartFeedback error={error} status={status} />
      <div className={styles.dialogActions}>
        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>返回列表</button>
        {status === 409 || (!snapshot && error) ? <button type="button" className={styles.secondaryButton} disabled={busy || loading} onClick={refresh}>重新核对这条收藏</button> : null}
        {collection?.resource && actionable ? <button type="button" className={restoring ? styles.primaryButton : styles.dangerButton} disabled={busy || loading || status === 409} onClick={() => void save()}>{busy ? "正在保存…" : restoring ? "确认恢复收藏" : "确认移出收藏"}</button> : null}
      </div>
    </div>
  </ManagerDialog>;
}
