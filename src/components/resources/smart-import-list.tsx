"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { SmartImportCreateResult, SmartImportList as BatchList } from "@/lib/smart-import-types";
import { ManagerDialog, ManagerIcon } from "./manager-primitives";
import { SmartFeedback } from "./smart-import-feedback";
import { smartDate, smartError, smartErrorStatus, smartRequest } from "./smart-api";
import styles from "./smart-import.module.css";

export const SMART_BATCH_STATUS = { reviewing: "待确认", paused: "已暂停", partial: "部分入库", completed: "已完成", cancelled: "已取消", failed: "处理失败" } as const;

export function SmartImportList() {
  const router = useRouter();
  const [data, setData] = useState<BatchList | null>(null);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [format, setFormat] = useState<"html" | "lines">("html");
  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadStatus, setUploadStatus] = useState(0);
  const requestId = useRef("");
  useEffect(() => {
    const controller = new AbortController();
    smartRequest<BatchList>("imports", { action: "list", page }, controller.signal).then(setData)
      .catch(failure => { if (!controller.signal.aborted) { setError(smartError(failure)); setErrorStatus(smartErrorStatus(failure)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, version]);
  function reload() { setError(""); setLoading(true); setVersion(value => value + 1); }
  function updateContent(value: string) { setContent(value); requestId.current = ""; }
  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]; if (!file) return;
    setUploadError(""); setUploadStatus(0); updateContent(""); setFilename("");
    if (file.size > 2 * 1024 * 1024) { setUploadError("文件超过 2 MB，请从浏览器分批导出后导入。"); return; }
    setBusy(true);
    try { updateContent(await file.text()); setFilename(file.name); setName(file.name.replace(/\.html?$/i, "")); }
    catch { setUploadError("文件读取失败，请重新选择。"); }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!content.trim() || busy) return;
    if (new Blob([content]).size > 2 * 1024 * 1024) { setUploadError("内容超过 2 MB，请分批导入。"); return; }
    requestId.current ||= crypto.randomUUID();
    setBusy(true); setUploadError("");
    try {
      const result = await smartRequest<SmartImportCreateResult>("imports", { action: "create", requestId: requestId.current, name: name.trim() || filename || "网址导入", format, content });
      router.push(`/tools/manage/imports/${encodeURIComponent(result.batch.id)}`);
    } catch (failure) { setUploadError(smartError(failure)); setUploadStatus(smartErrorStatus(failure)); }
    finally { setBusy(false); }
  }
  return <>
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>A FRESH START FOR YOUR BOOKMARKS</p><h1>导入记录</h1><p>分批整理收藏，随时回来继续。</p></div><button type="button" className={styles.primaryButton} onClick={() => setUploadOpen(true)}><ManagerIcon name="upload" />导入书签</button></header>
    <div className={styles.introStrip}><span className={styles.stepNumber}>01</span><p><strong>先预览与去重</strong><span>保留每份书签的来源</span></p><span className={styles.stepArrow}>→</span><span className={styles.stepNumber}>02</span><p><strong>分组确认</strong><span>建议可以采纳，也可修改</span></p><span className={styles.stepArrow}>→</span><span className={styles.stepNumber}>03</span><p><strong>仅自己可见</strong><span>入库与公开发布分开</span></p></div>
    <SmartFeedback error={error} status={errorStatus} onRefresh={reload} />
    {loading ? <p className={styles.loading} role="status">正在读取导入批次…</p> : data?.batches.length ? <><ul className={styles.batchList}>{data.batches.map(batch => <li key={batch.id}><div className={styles.batchIdentity}><span className={styles.batchIcon}><ManagerIcon name="folder" /></span><div><Link href={`/tools/manage/imports/${encodeURIComponent(batch.id)}`} className={styles.batchName}>{batch.name}</Link><p>{smartDate(batch.updatedAt)} · {batch.summary.rawTotal} 个来源 · {batch.summary.groupTotal} 个去重组</p></div></div><div className={styles.batchProgress}><span className={styles.statusBadge}>{SMART_BATCH_STATUS[batch.status]}</span><p>已入库 {batch.summary.createdResources} · 待处理 {batch.summary.pendingGroups}</p></div><Link className={styles.textLink} href={`/tools/manage/imports/${encodeURIComponent(batch.id)}`}>{batch.status === "completed" ? "查看结果" : "继续整理"}<span aria-hidden="true">→</span></Link></li>)}</ul><div className={styles.pagination}><span>共 {data.total} 个批次 · 第 {page} / {Math.max(1, Math.ceil(data.total / data.pageSize))} 页</span><div><button type="button" className={styles.secondaryButton} disabled={page === 1} onClick={() => { setLoading(true); setPage(value => value - 1); }}>上一页</button><button type="button" className={styles.secondaryButton} disabled={page * data.pageSize >= data.total} onClick={() => { setLoading(true); setPage(value => value + 1); }}>下一页</button></div></div></> : !error ? <div className={styles.empty}><ManagerIcon name="collection" /><h2>让收藏回到一个地方。</h2><p>导入书签 HTML 或粘贴网址。建立批次后，去重、分类和保留决定都会保存下来。</p><button type="button" className={styles.primaryButton} onClick={() => setUploadOpen(true)}>开始第一批导入</button></div> : null}
    {uploadOpen ? <ManagerDialog title="导入一批书签" description="解析后先进入私人工作区。确认入库前，不会加入收藏库或公开页面。" onClose={() => setUploadOpen(false)} busy={busy} wide><form className={styles.uploadForm} onSubmit={create}><fieldset disabled={busy}>
      <div className={styles.segmented}><button type="button" aria-pressed={format === "html"} onClick={() => { setFormat("html"); updateContent(""); setFilename(""); }}>书签 HTML</button><button type="button" aria-pressed={format === "lines"} onClick={() => { setFormat("lines"); updateContent(""); setFilename(""); }}>粘贴网址</button></div>
      <label>批次名称<input value={name} maxLength={120} onChange={event => { setName(event.target.value); requestId.current = ""; }} placeholder="例如：工作书签 · 九月" /></label>
      {format === "html" ? <label className={styles.filePicker}><ManagerIcon name="upload" /><strong>{filename || "选择浏览器导出的书签文件"}</strong><span>HTML / HTM · 最多 2 MB、5000 条链接</span><input type="file" accept=".html,.htm,text/html" onChange={readFile} /></label> : <label>网址，每行一个<textarea rows={8} value={content} onChange={event => updateContent(event.target.value)} placeholder={"https://example.com\nhttps://example.org/a-useful-guide"} /></label>}
      <p className={styles.help}>相同内容会优先继续已有批次，重复点击不会重复入库。原始 HTML 解析后不长期保存。</p>
    </fieldset><SmartFeedback error={uploadError} status={uploadStatus} /><div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setUploadOpen(false)}>稍后再说</button><button type="submit" className={styles.primaryButton} disabled={busy || !content.trim()}>{busy ? "正在准备批次…" : "解析并进入整理"}</button></div></form></ManagerDialog> : null}
  </>;
}
