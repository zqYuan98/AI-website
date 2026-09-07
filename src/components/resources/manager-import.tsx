import { useState, type ChangeEvent } from "react";
import type { ImportCandidate, LibraryResource } from "@/lib/resource-types";
import { managerError, managerRequest } from "./manager-api";
import { ManagerDialog, ManagerIcon } from "./manager-primitives";
import styles from "./manager-workspace.module.css";

type ImportPreview = { items: ImportCandidate[]; duplicates: unknown[] | number; invalid: unknown[] | number; invalidItems?: { name: string; url: string; reason: string }[] };
const count = (value: unknown[] | number) => Array.isArray(value) ? value.length : value;

function urlsToHtml(value: string): string {
  const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL>${value.split(/\r?\n/).map(url => url.trim()).filter(Boolean).map(url => `<DT><A HREF="${escape(url)}">${escape(url)}</A>`).join("\n")}</DL>`;
}

export function ManagerImport({ onClose, onImported }: { onClose: () => void; onImported: (resources: LibraryResource[], message: string, batchId?: string) => void }) {
  const [mode, setMode] = useState<"html" | "urls">("html");
  const [html, setHtml] = useState("");
  const [fileName, setFileName] = useState("");
  const [urls, setUrls] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setError(""); setPreview(null); setHtml(""); setFileName("");
    if (file.size > 2 * 1024 * 1024) { setError("文件过大，请分批导入，每批不超过 2 MB。"); setHtml(""); return; }
    setBusy(true);
    try { setHtml(await file.text()); setFileName(file.name); }
    catch { setError("文件未能读取，请重新选择书签 HTML。"); }
    finally { setBusy(false); }
  }

  async function parse() {
    setBusy(true); setError("");
    try {
      const result = await managerRequest<ImportPreview>({ action: "import-preview", html: mode === "html" ? html : urlsToHtml(urls) });
      setPreview(result); setSelected(new Set(result.items.map((_, index) => index)));
    } catch (failure) { setError(managerError(failure)); }
    finally { setBusy(false); }
  }

  async function confirmImport() {
    if (!preview || !selected.size || busy) return;
    setBusy(true); setError("");
    try {
      const result = await managerRequest<{ resources: LibraryResource[]; added: number; skipped: number; batchId?: string }>({ action: "import", items: preview.items.filter((_, index) => selected.has(index)) });
      onImported(result.resources, `已导入 ${result.added} 条私有收藏${result.skipped ? `，跳过 ${result.skipped} 条重复项` : ""}。可在导入记录中撤回本批新增。`, result.batchId);
      onClose();
    } catch (failure) { setError(managerError(failure)); }
    finally { setBusy(false); }
  }

  return <ManagerDialog title="让收藏回到一个地方" description="选择浏览器导出的书签 HTML，或粘贴网址。先预览再导入，所有新增都仅自己可见。" onClose={onClose} busy={busy} wide>
    <div className={styles.importBody}>
      <div className={styles.segmented} aria-label="导入方式"><button type="button" aria-pressed={mode === "html"} disabled={busy} onClick={() => { setMode("html"); setPreview(null); }}>书签 HTML</button><button type="button" aria-pressed={mode === "urls"} disabled={busy} onClick={() => { setMode("urls"); setPreview(null); }}>粘贴多个网址</button></div>
      {mode === "html" ? <label className={styles.filePicker}><ManagerIcon name="upload" /><strong>{fileName || "选择浏览器导出的书签文件"}</strong><span>支持 .html / .htm，保留原文件夹路径</span><input type="file" accept=".html,.htm,text/html" disabled={busy} onChange={readFile} /></label>
        : <label className={styles.field}>网址，每行一个<textarea rows={6} value={urls} disabled={busy} onChange={event => { setUrls(event.target.value); setPreview(null); }} placeholder={"https://example.com\nhttps://example.org/a-useful-guide"} /></label>}
      <div className={styles.inlineActions}><button className={styles.secondaryButton} type="button" disabled={busy || !(mode === "html" ? html : urls.trim())} onClick={parse}>{busy ? "正在处理…" : preview ? "重新解析" : "解析并预览"}</button><span className={styles.help}>此步骤不会写入收藏库。</span></div>
      {preview ? <section className={styles.previewSection} aria-label="导入预览"><div className={styles.previewStats}><span><strong>{preview.items.length}</strong>可导入</span><span><strong>{count(preview.duplicates)}</strong>重复，已跳过</span><span><strong>{count(preview.invalid)}</strong>无法处理</span></div>
        {preview.items.length ? <><label className={styles.checkLabel}><input type="checkbox" checked={selected.size === preview.items.length} onChange={event => setSelected(event.target.checked ? new Set(preview.items.map((_, index) => index)) : new Set())} />选择全部可导入资源</label><ul className={styles.previewList}>{preview.items.map((item, index) => <li key={`${item.url}-${index}`}><label className={styles.importCandidate}><input type="checkbox" checked={selected.has(index)} onChange={() => setSelected(previous => { const next = new Set(previous); if (next.has(index)) next.delete(index); else next.add(index); return next; })} /><span><strong>{item.name}</strong><small>{item.url}</small>{item.sourceFolder ? <small>原文件夹：{item.sourceFolder}</small> : null}</span></label></li>)}</ul></> : <p className={styles.help}>没有新的可导入资源。可以更换文件或修改网址后重试。</p>}
        {count(preview.invalid) ? <details className={styles.formDetails}><summary>查看无法处理的条目</summary><ul className={styles.issueList}>{preview.invalidItems?.length ? preview.invalidItems.map((item, index) => <li key={index}><strong>{item.name || "未命名书签"}</strong> · {item.reason}<br />{item.url}</li>) : <li>有 {count(preview.invalid)} 条网址未通过校验，请检查原文件后重试。</li>}</ul>{count(preview.invalid) > (preview.invalidItems?.length ?? 0) && preview.invalidItems?.length ? <p className={styles.help}>仅展示前 {preview.invalidItems.length} 条错误。修复原文件后可以重新解析。</p> : null}</details> : null}
      </section> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
    <footer className={styles.dialogActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>取消</button><button type="button" className={styles.primaryButton} disabled={busy || !preview || !selected.size} onClick={confirmImport}>{busy ? "正在处理…" : `确认导入${selected.size ? ` ${selected.size} 条` : ""}`}</button></footer>
  </ManagerDialog>;
}
