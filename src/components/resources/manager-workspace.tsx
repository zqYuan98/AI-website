"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RESOURCE_CATEGORIES, RESOURCE_KINDS, RESOURCE_KIND_LABELS, type LibraryResource, type LibraryState, type ResourceCategory, type ResourceKind } from "@/lib/resource-types";
import { displayDate, managerError, managerErrorStatus, managerRequest, type ManagerLibraryResult, type ManagerMode, type ManagerRequestContext } from "./manager-api";
import { ManagerDialog, ManagerErrorNotice, ManagerIcon, ManagerResourceIcon, type ManagerIconName } from "./manager-primitives";
import { ManagerEditor } from "./manager-editor";
import { ManagerImport } from "./manager-import";
import { ManagerPublish } from "./manager-publish";
import styles from "./manager-workspace.module.css";

type View = "all" | "pinned" | "inbox" | "featured" | "archived";
type Dialog = "add" | "edit" | "import" | "publish" | "history" | "filters" | null;
const VIEWS: { id: View; label: string; icon: ManagerIconName }[] = [
  { id: "all", label: "全部收藏", icon: "collection" },
  { id: "pinned", label: "常用", icon: "star" },
  { id: "inbox", label: "待整理", icon: "clock" },
  { id: "featured", label: "维他命精选", icon: "award" },
];

export function ResourceManager({ mode = "local", email }: { mode?: ManagerMode; email?: string }) {
  const router = useRouter();
  const [resources, setResources] = useState<LibraryResource[]>([]);
  const [libraryRevision, setLibraryRevision] = useState("");
  const [publishedIds, setPublishedIds] = useState<string[]>([]);
  const [publicationPending, setPublicationPending] = useState(false);
  const [publishedAt, setPublishedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(0);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState("");
  const [view, setView] = useState<View>("all");
  const [category, setCategory] = useState<ResourceCategory | "">("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ResourceKind | "">("");
  const [sort, setSort] = useState("newest");
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [limit, setLimit] = useState(40);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [editing, setEditing] = useState<LibraryResource | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const context: ManagerRequestContext = { mode, libraryRevision };
  const publishedIdSet = useMemo(() => new Set(publishedIds), [publishedIds]);
  const pendingWithdrawal = resources.filter(item => publishedIdSet.has(item.id) && (item.visibility !== "public" || item.status !== "organized"));

  useEffect(() => {
    const controller = new AbortController();
    managerRequest<ManagerLibraryResult>({ action: "list" }, { mode }, controller.signal)
      .then(result => { setResources(result.resources); setPublishedAt(result.publishedAt ?? ""); setLibraryRevision(result.libraryRevision ?? ""); setPublishedIds(result.publishedIds ?? []); })
      .catch(failure => { if (!controller.signal.aborted) { setError(managerError(failure)); setErrorStatus(managerErrorStatus(failure)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadVersion, mode]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const target = event.target;
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || document.querySelector("dialog[open]")) return;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault(); searchRef.current?.focus();
    }
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  const activeResources = resources.filter(item => item.status !== "archived");
  const pins = activeResources.filter(item => item.pinned);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return resources.filter(item => {
      if (view === "archived" ? item.status !== "archived" : item.status === "archived") return false;
      if (view === "pinned" && !item.pinned || view === "inbox" && item.status !== "inbox" || view === "featured" && !item.featured) return false;
      if (category && item.category !== category || kind && item.kind !== kind) return false;
      return !search || [item.name, item.url, item.description, item.category, item.subcategory, ...item.tags, item.notes].join(" ").toLocaleLowerCase().includes(search);
    }).sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "zh-CN");
      if (!a.createdAt || !b.createdAt) return a.createdAt ? -1 : b.createdAt ? 1 : a.name.localeCompare(b.name, "zh-CN");
      const difference = a.createdAt.localeCompare(b.createdAt);
      return (sort === "oldest" ? difference : -difference) || a.name.localeCompare(b.name, "zh-CN");
    });
  }, [resources, view, category, kind, query, sort]);
  const visible = filtered.slice(0, limit);
  const allVisibleSelected = visible.length > 0 && visible.every(item => selected.has(item.id));
  const batchGroups = Array.from(resources.reduce((groups, item) => {
    if (!item.importBatchId) return groups;
    const group = groups.get(item.importBatchId) ?? { id: item.importBatchId, count: 0, removable: 0, importedAt: item.importedAt ?? "" };
    group.count += 1;
    if (item.visibility === "private" && !publishedIdSet.has(item.id)) group.removable += 1;
    groups.set(item.importBatchId, group);
    return groups;
  }, new Map<string, { id: string; count: number; removable: number; importedAt: string }>()).values()).sort((a, b) => b.importedAt.localeCompare(a.importedAt));

  function updateResources(result: ManagerLibraryResult, feedback: string) {
    setResources(result.resources); setMessage(feedback); setError(""); setErrorStatus(0);
    if (result.libraryRevision) setLibraryRevision(result.libraryRevision);
    if (result.publishedIds) setPublishedIds(result.publishedIds);
    if (result.publishedAt) setPublishedAt(result.publishedAt);
  }
  function refreshList() { setLoading(true); setError(""); setErrorStatus(0); setLoadVersion(value => value + 1); }
  function changeView(next: View) { setView(next); setCategory(""); setLimit(40); if (dialog === "filters") setDialog(null); }
  function changeCategory(next: ResourceCategory | "") { setCategory(next); setView("all"); setLimit(40); if (dialog === "filters") setDialog(null); }
  function clearFilters() { setQuery(""); setCategory(""); setKind(""); setView("all"); setLimit(40); }
  function toggle(id: string) { setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function selectVisible() { setSelected(previous => { const next = new Set(previous); visible.forEach(item => { if (allVisibleSelected) next.delete(item.id); else next.add(item.id); }); return next; }); }

  async function bulk(changes: Record<string, unknown>) {
    if (!selected.size || pending || loading) return;
    setPending("bulk"); setError(""); setMessage("");
    try {
      const result = await managerRequest<ManagerLibraryResult>({ action: "bulk", ids: [...selected], changes }, context);
      updateResources(result, `已更新 ${selected.size} 条收藏。${mode === "cloud" ? "修改已保存到私人云端，发布到网站后公开页才会更新。" : changes.status === "archived" ? "归档内容已移出公开候选，重新生成公开版本后生效。" : "修改已保存在本机。"}`); setSelected(new Set());
    } catch (failure) { setError(managerError(failure)); setErrorStatus(managerErrorStatus(failure)); }
    finally { setPending(""); }
  }

  async function backup() {
    if (pending) return;
    setPending("backup"); setError("");
    try {
      const result = await managerRequest<{ data: LibraryState }>({ action: "backup" }, context);
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `vitamin-library-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("已下载完整收藏备份，包含你的私人备注。");
    } catch (failure) { setError(managerError(failure)); setErrorStatus(managerErrorStatus(failure)); }
    finally { setPending(""); }
  }

  async function undoImport(batchId: string) {
    if (pending) return;
    setPending(batchId); setError("");
    try {
      const result = await managerRequest<ManagerLibraryResult & { removed: number }>({ action: "undo-import", batchId }, context);
      updateResources(result, `已撤回本批 ${result.removed} 条私有新增；原有收藏和已公开内容保留。`);
      setSelected(new Set());
    } catch (failure) { setError(managerError(failure)); setErrorStatus(managerErrorStatus(failure)); }
    finally { setPending(""); }
  }

  async function signOut() {
    if (pending) return;
    setPending("signout"); setError("");
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store" });
      if (!response.ok && response.status !== 401) throw new Error("退出未完成，请稍后重试。");
      setResources([]); setPublishedIds([]); setSelected(new Set()); setLibraryRevision("");
      router.replace("/login"); router.refresh();
    } catch { setError("退出未完成，请检查网络后重试。"); }
    finally { setPending(""); }
  }

  async function refreshPublication() {
    if (pending) return;
    setPending("refresh-publication"); setError("");
    try {
      await managerRequest<{ cacheStatus: "refreshed" }>({ action: "refresh-publication" }, context);
      setPublicationPending(false); setMessage("公开页刷新已完成。打开公开页查看最新版本。");
    } catch (failure) { setError(managerError(failure)); setErrorStatus(managerErrorStatus(failure)); }
    finally { setPending(""); }
  }

  const sidebarContent = <>
    <p className={styles.navLabel}>我的收藏</p><nav aria-label="收藏视图" className={styles.navGroup}>{VIEWS.map(item => <button key={item.id} type="button" aria-pressed={view === item.id && !category} onClick={() => changeView(item.id)}><ManagerIcon name={item.icon} /><span>{item.label}</span><small>{item.id === "all" ? activeResources.length : item.id === "pinned" ? pins.length : item.id === "inbox" ? activeResources.filter(resource => resource.status === "inbox").length : activeResources.filter(resource => resource.featured).length}</small></button>)}</nav>
    <div className={styles.navDivider} /><p className={styles.navLabel}>按用途</p><nav aria-label="用途分类" className={styles.navGroup}>{RESOURCE_CATEGORIES.map((item, index) => <button key={item} type="button" aria-pressed={category === item} onClick={() => changeCategory(item)}><span className={styles.categoryNumber} aria-hidden="true">0{index + 1}</span><span>{item}</span><small>{activeResources.filter(resource => resource.category === item).length}</small></button>)}</nav>
    <div className={styles.navDivider} /><nav aria-label="维护工具" className={styles.navGroup}><button type="button" onClick={() => setDialog("history")}><ManagerIcon name="clock" /><span>导入记录</span></button><button type="button" aria-pressed={view === "archived"} onClick={() => changeView("archived")}><ManagerIcon name="archive" /><span>已归档</span><small>{resources.length - activeResources.length}</small></button><button type="button" disabled={Boolean(pending) || loading} onClick={backup}><ManagerIcon name="download" /><span>{pending === "backup" ? "正在下载…" : "下载完整备份"}</span></button></nav>
    <p className={styles.sidebarNote}>{mode === "cloud" ? "收藏保存在私人云端。" : "收藏保存在本机。"}<br />保存不发布，分享由你决定。</p>
  </>;

  return <section className={styles.workspace}>
    <div className={styles.workspaceTop}><span className={styles.workspaceLabel}><span className={styles.brandMark}>NV</span>我的资源库 <span className={styles.localBadge}>{mode === "cloud" ? "私人云端" : "本机管理"}</span></span><div className={styles.workspaceAccount}>{mode === "cloud" && email ? <span className={styles.accountEmail}>{email}</span> : null}<a className={styles.publicLink} href="/tools" target="_blank" rel="noreferrer">查看公开页 <ManagerIcon name="arrow" /></a>{mode === "cloud" ? <button type="button" className={styles.signOutButton} disabled={Boolean(pending)} onClick={signOut}>{pending === "signout" ? "正在退出…" : "退出"}</button> : null}</div></div>
    <div className={styles.workspaceGrid}><aside className={styles.sidebar}>{sidebarContent}</aside><div className={styles.main}>
      <header className={styles.pageHeading}><div><p className={styles.eyebrow}>A PLACE FOR YOUR GOOD FINDS</p><h1>{mode === "cloud" ? "我的资源库" : "我的收藏"}<span className={styles.titleDot}>.</span></h1><p>统一收好工具、网站和资料，需要时快速找到。</p><span className={styles.resourceCount}>{loading ? mode === "cloud" ? "正在读取私人云端…" : "正在读取本机收藏…" : `${resources.length} 条资源 · ${activeResources.filter(item => item.status === "inbox").length} 条待整理`}</span></div><div className={styles.headingActions}><button className={styles.secondaryButton} disabled={loading || Boolean(pending)} type="button" onClick={() => setDialog("import")}><ManagerIcon name="upload" />导入书签</button><button className={styles.primaryButton} disabled={loading || Boolean(pending)} type="button" onClick={() => setDialog("add")}><ManagerIcon name="plus" />添加资源</button></div></header>
      <div className={styles.searchRow}><div className={styles.search}><ManagerIcon name="search" /><input ref={searchRef} type="search" aria-label="搜索我的收藏" placeholder="搜索名称、域名、用途或标签…" value={query} onChange={event => { setQuery(event.target.value); setLimit(40); }} /><kbd>/</kbd></div><button type="button" className={`${styles.secondaryButton} ${styles.mobileFilter}`} onClick={() => setDialog("filters")}><ManagerIcon name="list" />筛选</button></div>
      {message ? <div className={styles.feedback} role="status"><ManagerIcon name="check" /><p>{message}</p><button type="button" className={styles.iconButton} aria-label="关闭提示" onClick={() => setMessage("")}><ManagerIcon name="close" /></button></div> : null}
      {publicationPending ? <div className={styles.publicationRetry}><p>公开版本已保存，缓存刷新尚未完成。</p><button type="button" className={styles.secondaryButton} disabled={Boolean(pending)} onClick={refreshPublication}>{pending === "refresh-publication" ? "正在刷新…" : "重试公开页刷新"}</button></div> : null}
      {error && dialog !== "history" ? <ManagerErrorNotice message={error} status={errorStatus} onRefresh={refreshList} /> : null}
      {pins.length && view === "all" && !category && !query && !kind ? <section className={styles.pins} aria-label="我的常用入口"><p>常用入口 <span>随手置顶，随时回来</span></p><div>{pins.map(item => <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"><ManagerResourceIcon name={item.name} icon={item.icon} /><strong>{item.name}</strong><ManagerIcon name="arrow" /></a>)}</div></section> : null}
      <div className={styles.toolbar}><div className={styles.kindTabs} aria-label="资源类型"><button type="button" aria-pressed={!kind} onClick={() => { setKind(""); setLimit(40); }}>全部类型</button>{RESOURCE_KINDS.map(item => <button key={item} type="button" aria-pressed={kind === item} onClick={() => { setKind(item); setLimit(40); }}>{RESOURCE_KIND_LABELS[item]}</button>)}</div><div className={styles.viewControls}><select aria-label="收藏排序" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">最近添加</option><option value="oldest">最早添加</option><option value="name">按名称</option></select><div className={styles.segmented}><button type="button" aria-label="列表视图" aria-pressed={layout === "list"} onClick={() => setLayout("list")}><ManagerIcon name="list" /></button><button type="button" aria-label="网格视图" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}><ManagerIcon name="grid" /></button></div></div></div>
      {category || view !== "all" || query || kind ? <div className={styles.filterSummary}><span>{category || (view === "archived" ? "已归档" : VIEWS.find(item => item.id === view)?.label)}{kind ? ` / ${RESOURCE_KIND_LABELS[kind]}` : ""}{query ? ` / “${query}”` : ""} · {filtered.length} 条</span><button type="button" onClick={clearFilters}>清除筛选</button></div> : null}
      {selected.size ? <div className={styles.bulkBar}><strong>已选 {selected.size} 条</strong><select aria-label="批量分类" value="" disabled={Boolean(pending)} onChange={event => { if (event.target.value) void bulk({ category: event.target.value }); }}><option value="">调整分类</option>{RESOURCE_CATEGORIES.map(item => <option key={item}>{item}</option>)}</select><button type="button" disabled={Boolean(pending)} onClick={() => bulk({ status: "organized" })}>标为已整理</button><button type="button" disabled={Boolean(pending)} onClick={() => bulk({ visibility: "private" })}>设为仅自己</button><button type="button" disabled={Boolean(pending)} onClick={() => bulk({ visibility: "public", status: "organized" })}>设为公开候选</button><button type="button" disabled={Boolean(pending)} onClick={() => bulk({ status: view === "archived" ? "organized" : "archived" })}>{view === "archived" ? "恢复为已整理" : "归档"}</button><button type="button" disabled={Boolean(pending)} onClick={() => bulk({ pinned: true })}>设为常用</button><button type="button" onClick={() => setSelected(new Set())}>取消选择</button>{pending === "bulk" ? <span role="status">正在保存…</span> : null}</div> : null}
      {loading ? <div className={styles.loading} role="status"><span className={styles.loadingDot} />正在打开你的资源库…</div> : filtered.length ? <><div className={styles.listHeader}><label className={styles.selectBox}><input type="checkbox" aria-label="选择本页资源" checked={allVisibleSelected} onChange={selectVisible} /></label><span>名称 / 用途</span><span>类型</span><span>用途分类</span><span>展示范围</span><span className={styles.srOnly}>操作</span></div><ul className={layout === "grid" ? styles.resourceGrid : styles.resourceList} aria-label="收藏资源">{visible.map(item => <li key={item.id} className={`${styles.resourceRow} ${selected.has(item.id) ? styles.selectedRow : ""}`}><label className={styles.selectBox}><input type="checkbox" aria-label={`选择 ${item.name}`} checked={selected.has(item.id)} onChange={() => toggle(item.id)} /></label><div className={styles.resourceMain}><ManagerResourceIcon name={item.name} icon={item.icon} /><div><button type="button" className={styles.resourceName} onClick={() => { setEditing(item); setDialog("edit"); }}>{item.name}{item.pinned ? <span className={styles.pinIndicator} aria-label="常用">★</span> : null}</button><p>{item.description || "还没有用途说明，点击名称补充"}</p></div></div><span className={styles.kindCell}>{RESOURCE_KIND_LABELS[item.kind]}</span><span className={styles.categoryCell}>{item.category}</span><span className={`${styles.visibilityCell} ${item.visibility === "public" ? styles.isPublic : ""}`}>{publishedIdSet.has(item.id) && (item.visibility !== "public" || item.status !== "organized") ? <span className={styles.pendingWithdrawal}>待撤下</span> : item.visibility === "public" ? "公开候选" : "仅自己"}{item.status === "inbox" ? <small>待整理</small> : item.featured ? <small>精选</small> : null}</span><div className={styles.rowActions}><a className={styles.iconButton} href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`打开 ${item.name}`}><ManagerIcon name="arrow" /></a><button type="button" className={styles.iconButton} aria-label={`编辑 ${item.name}`} onClick={() => { setEditing(item); setDialog("edit"); }}><ManagerIcon name="edit" /></button></div></li>)}</ul><div className={styles.listFooter}><span>已显示 {visible.length} / {filtered.length} 条{selected.size ? ` · 选中 ${selected.size} 条（含其他筛选下的选择）` : ""}</span>{visible.length < filtered.length ? <button type="button" className={styles.secondaryButton} onClick={() => setLimit(value => value + 40)}>加载更多</button> : null}</div></> : <div className={styles.empty}><ManagerIcon name="collection" /><h2>{view === "pinned" && !query ? "把常用的，放在手边。" : "这里还没有匹配的收藏"}</h2><p>{view === "pinned" && !query ? "编辑资源并勾选“置顶为我的常用”，下次打开就能直接找到。" : "试试其他名称或用途，或清除筛选浏览全部收藏。"}</p><button type="button" className={styles.secondaryButton} onClick={clearFilters}>查看全部收藏</button></div>}
      <section className={styles.publicationStrip}><div><strong>把精选分享出去</strong><p>{publishedAt ? `上次${mode === "cloud" ? "发布" : "生成公开版本"}：${displayDate(publishedAt)}` : mode === "cloud" ? "保存的修改尚未发布到网站。" : "你的本机修改尚未生成新的公开版本。"}{mode === "cloud" ? " · 保存不等于发布" : " · 部署后线上生效"}</p>{pendingWithdrawal.length ? <p className={styles.withdrawalNote}>{pendingWithdrawal.length} 条资源待从公开页撤下，发布后生效。</p> : null}</div><button type="button" className={styles.secondaryButton} disabled={loading || Boolean(pending)} onClick={() => setDialog("publish")}>{mode === "cloud" ? "发布到网站" : "预览公开版本"} <ManagerIcon name="arrow" /></button></section>
    </div></div>
    {dialog === "add" || dialog === "edit" ? <ManagerEditor key={dialog === "edit" ? editing?.id : "new"} resource={dialog === "edit" ? editing : null} context={context} onClose={() => setDialog(null)} onSaved={updateResources} /> : null}
    {dialog === "import" ? <ManagerImport context={context} onClose={() => setDialog(null)} onImported={updateResources} /> : null}
    {dialog === "publish" ? <ManagerPublish resources={resources} context={context} onClose={() => setDialog(null)} onPublished={(result, feedback) => { setPublishedAt(result.publishedAt); setMessage(feedback); setPublicationPending(result.cacheStatus === "pending"); if (result.libraryRevision) setLibraryRevision(result.libraryRevision); if (result.publishedIds) setPublishedIds(result.publishedIds); setLoadVersion(version => version + 1); }} /> : null}
    {dialog === "filters" ? <ManagerDialog title="找到需要的收藏" onClose={() => setDialog(null)}><div className={styles.mobileSidebar}>{sidebarContent}</div></ManagerDialog> : null}
    {dialog === "history" ? <ManagerDialog title="导入记录" description="可以撤回本批新增的私有资源，原有收藏和已发布资源会保留。" onClose={() => setDialog(null)} busy={Boolean(pending)}><div className={styles.importBody}>{batchGroups.length ? <ul className={styles.batchList}>{batchGroups.map(batch => <li key={batch.id}><div><strong>{batch.importedAt ? `${displayDate(batch.importedAt)} 的导入` : "导入批次"}</strong><p>本批现存 {batch.count} 条 · {batch.removable} 条私有资源</p></div><button type="button" className={styles.secondaryButton} disabled={Boolean(pending) || !batch.removable} onClick={() => undoImport(batch.id)}>{pending === batch.id ? "正在撤回…" : "撤回本批私有新增"}</button></li>)}</ul> : <p className={styles.help}>还没有浏览器书签导入记录。导入时会自动记录批次。</p>}{error ? <ManagerErrorNotice message={error} status={errorStatus} onRefresh={refreshList} /> : null}{message ? <p className={styles.feedback} role="status">{message}</p> : null}</div></ManagerDialog> : null}
  </section>;
}
