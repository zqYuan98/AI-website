import { useState, type FormEvent } from "react";
import { RESOURCE_CATEGORIES, RESOURCE_KINDS, RESOURCE_KIND_LABELS, type LibraryResource } from "@/lib/resource-types";
import { managerError, managerErrorStatus, managerRequest, type ManagerLibraryResult, type ManagerRequestContext } from "./manager-api";
import { ManagerDialog, ManagerErrorNotice } from "./manager-primitives";
import styles from "./manager-workspace.module.css";

export function ManagerEditor({ resource, context, onClose, onSaved }: { resource: LibraryResource | null; context: ManagerRequestContext; onClose: () => void; onSaved: (result: ManagerLibraryResult, message: string) => void }) {
  // Keep the revision of the resource being edited, even if the outer list refreshes.
  const [requestContext] = useState(() => ({ ...context }));
  const [visibility, setVisibility] = useState(resource?.visibility ?? "private");
  const [status, setStatus] = useState(resource?.status ?? "inbox");
  const [featured, setFeatured] = useState(resource?.featured ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(0);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    const tags = text("tags").split(/[,，、]/).map(tag => tag.trim()).filter(Boolean);
    if (tags.length > 20 || tags.some(tag => tag.length > 40)) { setError("最多添加 20 个标签，每个标签不超过 40 个字符。"); return; }
    setBusy(true); setError("");
    try {
      const result = await managerRequest<ManagerLibraryResult>({ action: "save", resource: {
        ...(resource ?? {}),
        name: text("name"), url: text("url"), description: text("description"),
        kind: text("kind"), category: text("category"), subcategory: text("subcategory"),
        tags,
        notes: text("notes"), recommendation: text("recommendation"),
        audience: text("audience"), usage: text("usage"), boundary: text("boundary"),
        visibility, status, featured, pinned: data.get("pinned") === "on",
      } }, requestContext);
      onSaved(result, resource ? requestContext.mode === "cloud" ? "修改已保存到私人云端。点击“发布到网站”后，公开页才会更新。" : "修改已保存在本机。公开页需重新生成公开版本后更新。" : "已加入仅自己可见的待整理收藏，尚未公开。");
      onClose();
    } catch (failure) { setError(managerError(failure)); setErrorStatus(managerErrorStatus(failure)); }
    finally { setBusy(false); }
  }

  return <ManagerDialog title={resource ? "整理这份收藏" : "添加一个资源"} description={resource ? "把用途写清楚，下次回来更容易找到。私人备注始终仅自己可见。" : "先记下名称和网址，其他信息以后慢慢补。新资源仅自己可见。"} onClose={onClose} busy={busy}>
    <form onSubmit={save} className={styles.form}>
      <div className={styles.formGrid}>
        <label>名称 <span>*</span><input name="name" required maxLength={120} defaultValue={resource?.name} placeholder="例如：NotebookLM" autoComplete="off" /></label>
        <label>网址 <span>*</span><input name="url" type="url" required maxLength={2048} defaultValue={resource?.url} placeholder="https://example.com" autoComplete="off" /></label>
        <label>内容类型<select name="kind" defaultValue={resource?.kind ?? "website"}>{RESOURCE_KINDS.map(kind => <option key={kind} value={kind}>{RESOURCE_KIND_LABELS[kind]}</option>)}</select></label>
        <label>主要用途<select name="category" defaultValue={resource?.category ?? "效率与生活"}>{RESOURCE_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
        <label>细分类（选填）<input name="subcategory" maxLength={80} defaultValue={resource?.subcategory} placeholder="例如：检索与研究" /></label>
        <label>标签（逗号分隔）<input name="tags" maxLength={320} defaultValue={resource?.tags.join("，")} placeholder="AI，资料整理" /></label>
      </div>
      <label>一句话用途<textarea name="description" rows={2} maxLength={500} defaultValue={resource?.description} placeholder="它能帮你完成什么事？" /></label>
      <label className={styles.privateField}>私人备注 <span className={styles.smallBadge}>{requestContext.mode === "cloud" ? "仅自己" : "仅本机"}</span><textarea name="notes" rows={3} maxLength={10000} defaultValue={resource?.notes} placeholder="自己的想法、使用笔记、待办……" /></label>
      <div className={styles.formGrid}>
        <label>展示范围<select value={visibility} disabled={!resource} onChange={event => { const next = event.target.value as LibraryResource["visibility"]; setVisibility(next); if (next === "private") setFeatured(false); }}><option value="private">仅自己</option><option value="public" disabled={status !== "organized"}>公开候选（需已整理）</option></select></label>
        <label>整理状态<select value={status} disabled={!resource} onChange={event => { const next = event.target.value as LibraryResource["status"]; setStatus(next); if (next !== "organized") { setFeatured(false); setVisibility("private"); } }}><option value="inbox">待整理</option><option value="organized">已整理</option><option value="archived">已归档</option></select></label>
      </div>
      <div className={styles.checkGroup}>
        <label className={styles.checkLabel}><input type="checkbox" name="pinned" defaultChecked={resource?.pinned} />置顶为我的常用</label>
        <label className={styles.checkLabel}><input type="checkbox" checked={featured} disabled={!resource || visibility !== "public" || status !== "organized"} onChange={event => setFeatured(event.target.checked)} />加入维他命精选</label>
      </div>
      <p className={styles.help}>先设为已整理，再选择公开候选。精选还需要真实推荐理由；常用是个人偏好，与精选互不绑定。</p>
      <label>为什么推荐{featured ? <span> *</span> : null}<textarea name="recommendation" required={featured} maxLength={2000} rows={3} defaultValue={resource?.recommendation} placeholder="说说真实的使用场景与选择理由；普通收藏可以不填。" /></label>
      <details className={styles.formDetails}><summary>使用方式与适用边界</summary><div className={styles.detailsFields}>
        <label>适合谁<input name="audience" maxLength={1000} defaultValue={resource?.audience} /></label>
        <label>怎么用<textarea name="usage" rows={2} maxLength={2000} defaultValue={resource?.usage} /></label>
        <label>适用边界<textarea name="boundary" rows={2} maxLength={2000} defaultValue={resource?.boundary} /></label>
      </div></details>
      {error ? <ManagerErrorNotice message={error} status={errorStatus} /> : null}
      <footer className={styles.dialogActions}><button type="button" className={styles.secondaryButton} onClick={onClose} disabled={busy}>取消</button><button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? "正在保存…" : requestContext.mode === "cloud" ? "保存到资源库" : "保存到本机"}</button></footer>
    </form>
  </ManagerDialog>;
}
