import { useEffect, useState } from "react";
import { RESOURCE_KIND_LABELS, type LibraryResource, type PublishPreview } from "@/lib/resource-types";
import { managerError, managerRequest } from "./manager-api";
import { ManagerDialog } from "./manager-primitives";
import styles from "./manager-workspace.module.css";

export function ManagerPublish({ resources, onClose, onPublished }: { resources: LibraryResource[]; onClose: () => void; onPublished: (publishedAt: string, message: string) => void }) {
  const [preview, setPreview] = useState<PublishPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    managerRequest<PublishPreview>({ action: "publish-preview" }, controller.signal)
      .then(setPreview).catch(failure => { if (!controller.signal.aborted) setError(managerError(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);
  function refresh() { setError(""); setPreview(null); setLoading(true); setVersion(value => value + 1); }
  async function publish() {
    if (!preview || busy) return;
    setBusy(true); setError("");
    try {
      const result = await managerRequest<{ publishedAt: string; count: number }>({ action: "publish", revision: preview.revision });
      onPublished(result.publishedAt, `已生成 ${result.count} 条资源的公开版本。现有部署流程完成后，线上网站才会更新。`);
      onClose();
    } catch (failure) { setError(managerError(failure)); }
    finally { setBusy(false); }
  }
  const names = new Map(resources.map(item => [item.id, item.name]));
  const changes = preview ? [{ title: "新增", ids: preview.added }, { title: "撤下", ids: preview.removed }, { title: "变更", ids: preview.changed }] : [];
  return <ManagerDialog title="检查这次公开的内容" description="只有下面预览中的公开字段会进入网站。私人备注、原书签文件夹和导入记录不会发布。" onClose={onClose} busy={busy} wide>
    <div className={styles.publishBody}>
      <p className={styles.publishNote}>生成的是本地公开版本。部署后线上生效；此操作不会执行部署。</p>
      {loading ? <p className={styles.loading} role="status">正在准备公开预览…</p> : null}
      {preview ? <><div className={styles.previewStats}>{changes.map(group => <span key={group.title}><strong>{group.ids.length}</strong>{group.title}</span>)}<span><strong>{preview.resources.length}</strong>公开资源</span></div>
        <div className={styles.changeGroups}>{changes.map(group => <details key={group.title} open={group.ids.length > 0 && group.ids.length < 8}><summary>{group.title}名单 · {group.ids.length}</summary>{group.ids.length ? <ul>{group.ids.map(id => <li key={id}>{names.get(id) || id}</li>)}</ul> : <p className={styles.help}>本次没有{group.title}。</p>}</details>)}</div>
        <h3 className={styles.previewHeading}>公开内容预览</h3><p className={styles.help}>展开任一条目，检查访客会看到的用途、推荐理由和链接。</p>
        <div className={styles.publicPreviewList}>{preview.resources.map(item => <details key={item.id}><summary><strong>{item.name}</strong><span>{RESOURCE_KIND_LABELS[item.kind]} · {item.category}{item.featured ? " · 精选" : ""}</span></summary><dl>
          <dt>名称</dt><dd>{item.name}</dd><dt>网址</dt><dd>{item.url}</dd><dt>用途说明</dt><dd>{item.description || "—"}</dd><dt>类型与分类</dt><dd>{RESOURCE_KIND_LABELS[item.kind]} / {item.category}{item.subcategory ? ` / ${item.subcategory}` : ""}</dd><dt>标签</dt><dd>{item.tags.join("、") || "—"}</dd><dt>推荐理由</dt><dd>{item.recommendation || "—"}</dd><dt>适合谁</dt><dd>{item.audience || "—"}</dd><dt>怎么用</dt><dd>{item.usage || "—"}</dd><dt>适用边界</dt><dd>{item.boundary || "—"}</dd><dt>替代选择</dt><dd>{item.alternatives.join("、") || "—"}</dd><dt>精选 / 作者在用</dt><dd>{item.featured ? "是" : "否"} / {item.usedByVitamin ? "是" : "否"}</dd><dt>关联内容</dt><dd>{item.relatedHref || "—"}</dd>
        </dl></details>)}</div>
      </> : null}
      {error ? <div className={styles.error} role="alert"><p>{error}</p><button type="button" className={styles.secondaryButton} disabled={busy} onClick={refresh}>重新获取预览</button></div> : null}
    </div>
    <footer className={styles.dialogActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>继续整理</button><button type="button" className={styles.primaryButton} disabled={busy || loading || !preview} onClick={publish}>{busy ? "正在生成…" : "生成公开版本"}</button></footer>
  </ManagerDialog>;
}
