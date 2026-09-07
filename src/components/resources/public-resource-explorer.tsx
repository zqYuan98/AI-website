"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  RESOURCE_PAGE_SIZE, filterPublicResources, indexPublicResources, parseResourceExplorerState,
  serializeResourceExplorerState, type ResourceExplorerState, type ResourceView,
} from "@/lib/resource-explorer-state";
import { RESOURCE_CATEGORIES, RESOURCE_KINDS, RESOURCE_KIND_LABELS, type PublicResource, type ResourceCategory, type ResourceKind } from "@/lib/resource-types";
import { PublicReadingList, PublicResourceCard } from "./public-resource-card";
import { PublicResourceDetail } from "./public-resource-detail";
import styles from "./public-library.module.css";

const LOCATION_EVENT = "public-resource-location-change";
const VIEWS: { id: ResourceView; label: string }[] = [
  { id: "featured", label: "维他命精选" },
  { id: "browse", label: "按用途浏览" },
  { id: "reading", label: "阅读与资源" },
];
function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(LOCATION_EVENT, onChange);
  return () => { window.removeEventListener("popstate", onChange); window.removeEventListener(LOCATION_EVENT, onChange); };
}
function getLocationSnapshot() { return window.location.search; }
function getServerLocationSnapshot() { return ""; }
function RouterLocationObserver() {
  const searchParams = useSearchParams();
  useEffect(() => { window.dispatchEvent(new Event(LOCATION_EVENT)); }, [searchParams]);
  return null;
}
function SearchIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.1" stroke="currentColor" strokeWidth="1.7" /><path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}
function LayoutIcon({ layout }: { layout: "grid" | "list" }) {
  return layout === "grid"
    ? <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="2" y="2" width="6" height="6" rx="1" /><rect x="12" y="2" width="6" height="6" rx="1" /><rect x="2" y="12" width="6" height="6" rx="1" /><rect x="12" y="12" width="6" height="6" rx="1" /></svg>
    : <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 4h12M6 10h12M6 16h12M2 4h1M2 10h1M2 16h1" strokeLinecap="round" /></svg>;
}
function SelectionStandards() {
  return <aside className={styles.standards} aria-labelledby="resource-standards-title">
    <span className={styles.nvSignature}>NV</span><p className={styles.standardsKicker}>A FEW GOOD REASONS</p><h2 id="resource-standards-title">这份清单，怎么选？</h2>
    <ol>
      <li><span>01</span><div><strong>解决具体问题</strong><p>先确认问题真实存在，再挑选有明确用途的工具。</p></div></li>
      <li><span>02</span><div><strong>写清使用理由</strong><p>精选附上实际使用方式，结果需要能被检查。</p></div></li>
      <li><span>03</span><div><strong>保留适用边界</strong><p>写清适合什么、不适合什么，帮你判断取舍。</p></div></li>
    </ol><p className={styles.standardsNote}>精选是有理由的选择。<br />更多公开收藏，留给你按需探索。</p>
  </aside>;
}

export function PublicResourceExplorer({ resources }: { resources: PublicResource[] }) {
  const searchRef = useRef<HTMLInputElement>(null);
  const filterDialogRef = useRef<HTMLDialogElement>(null);
  const locationSearch = useSyncExternalStore(subscribeToLocation, getLocationSnapshot, getServerLocationSnapshot);
  const state = useMemo(() => parseResourceExplorerState(locationSearch), [locationSearch]);
  const indexedResources = useMemo(() => indexPublicResources(resources), [resources]);
  const filteredResources = useMemo(() => filterPublicResources(indexedResources, state), [indexedResources, state]);
  const [selectedResource, setSelectedResource] = useState<PublicResource | null>(null);
  const featuredResources = useMemo(() => resources.filter((resource) => resource.featured && resource.kind !== "article"), [resources]);
  const readingResources = useMemo(() => resources.filter((resource) => resource.kind === "article"), [resources]);
  const hasFilters = Boolean(state.category || state.kind !== "all" || state.featuredOnly || state.readingType);
  const visibleResources = filteredResources.slice(0, state.page * RESOURCE_PAGE_SIZE);
  const remaining = filteredResources.length - visibleResources.length;
  const subcategories = useMemo(() => state.category ? [...new Set(resources.filter((resource) => resource.category === state.category).map((resource) => resource.subcategory).filter(Boolean))] : [], [resources, state.category]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const editing = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !editing && !document.querySelector("dialog[open]")) { event.preventDefault(); searchRef.current?.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function updateState(patch: Partial<ResourceExplorerState>, replace = false) {
    const nextState = { ...state, page: 1, ...patch };
    const href = serializeResourceExplorerState(nextState, window.location.href);
    if (replace) window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
    window.dispatchEvent(new Event(LOCATION_EVENT));
  }
  function changeView(view: ResourceView) { updateState({ view, query: "", category: null, subcategory: "", kind: "all", readingType: "", featuredOnly: false }); }
  function clearFilters() { updateState({ category: null, subcategory: "", kind: "all", readingType: "", featuredOnly: false }); }
  function chooseCategory(category: ResourceCategory | null) { updateState({ category, subcategory: "" }); filterDialogRef.current?.close(); }
  function renderCategories() {
    return <div className={styles.categoryChoices}>
      <button className={!state.category ? styles.categoryActive : ""} aria-pressed={!state.category} onClick={() => chooseCategory(null)}><span>全部用途</span><span>{resources.length}</span></button>
      {RESOURCE_CATEGORIES.map((category) => <button key={category} className={state.category === category ? styles.categoryActive : ""} aria-pressed={state.category === category} onClick={() => chooseCategory(category)}><span>{category}</span><span>{resources.filter((resource) => resource.category === category).length}</span></button>)}
    </div>;
  }

  return <div className={styles.explorer}>
    <Suspense fallback={null}><RouterLocationObserver /></Suspense>
    <div className={styles.searchWrap}>
      <label className={styles.srOnly} htmlFor="public-resource-search">搜索公开资源</label><SearchIcon />
      <input ref={searchRef} id="public-resource-search" type="search" value={state.query} placeholder="搜索工具、网站、文章，或你想做的事…" autoComplete="off" onChange={(event) => updateState({ query: event.target.value, view: "browse", ...(state.view === "reading" ? { kind: "all", readingType: "" } : {}) }, Boolean(state.query))} />
      {state.query ? <button className={styles.clearSearch} aria-label="清空搜索" onClick={() => { updateState({ query: "" }); searchRef.current?.focus(); }}>×</button> : <kbd className={styles.shortcut}>/</kbd>}
    </div>
    <div className={styles.navigationRow}>
      <nav className={styles.viewTabs} aria-label="资源视图">{VIEWS.map((view) => <button key={view.id} className={state.view === view.id ? styles.activeTab : ""} aria-current={state.view === view.id ? "page" : undefined} onClick={() => changeView(view.id)}>{view.label}</button>)}</nav>
      <div className={styles.navigationActions}><p className={styles.libraryCount}>{featuredResources.length} 个精选工具<span>·</span>{readingResources.length} 篇阅读资源</p><Link href="/tools/manage" prefetch={false} className={styles.managementLink}>管理资源 <span aria-hidden="true">↗</span></Link></div>
    </div>
    {state.view === "featured" ? <div className={styles.featuredLayout}>
      <div className={styles.featuredContent}>
        <section aria-labelledby="featured-tools-title">
          <div className={styles.sectionHeading}><h2 id="featured-tools-title"><span className={styles.sectionNumber}>01</span>进入工作流的工具</h2></div>
          <div className={styles.featuredGrid}>{featuredResources.map((resource) => <PublicResourceCard key={resource.id} resource={resource} onDetails={setSelectedResource} featured />)}</div>
          {!featuredResources.length ? <p className={styles.emptyFeatured}>精选清单还在整理中，可以先按用途浏览公开资源。</p> : null}
        </section>
        <section className={styles.featuredReading} aria-labelledby="featured-reading-title">
          <div className={styles.sectionHeading}><h2 id="featured-reading-title">值得读的内容</h2><button className={styles.textButton} onClick={() => changeView("reading")}>查看全部 {readingResources.length} 篇 <span aria-hidden="true">→</span></button></div>
          <PublicReadingList resources={readingResources.slice(0, 3)} onDetails={setSelectedResource} />
        </section>
        <button className={styles.browseAll} onClick={() => changeView("browse")}>浏览全部 {resources.length} 个公开资源 <span aria-hidden="true">→</span></button>
      </div><SelectionStandards />
    </div> : <div className={state.view === "browse" ? styles.browseLayout : styles.readingLayout}>
      {state.view === "browse" ? <aside className={styles.categorySidebar} aria-labelledby="resource-category-title"><h2 id="resource-category-title">按用途查找</h2>{renderCategories()}<p>先看用途，再选类型。<br />按你正在做的事找入口。</p></aside> : null}
      <section className={styles.results} aria-labelledby="resource-results-title">
        <div className={styles.resultsHeading}><div><h2 id="resource-results-title">{state.query.trim() ? "公开资源搜索结果" : state.view === "reading" ? "阅读与资源" : state.category || "全部公开资源"}</h2><p role="status" aria-live="polite">{state.query.trim() ? `“${state.query.trim()}” · ` : ""}找到 {filteredResources.length} 个{hasFilters ? "符合条件的" : "公开"}资源</p></div></div>
        <div className={styles.toolbar}>
          {state.view === "browse" ? <button className={styles.mobileFilterButton} onClick={() => filterDialogRef.current?.showModal()}>{state.category || "用途筛选"}<span aria-hidden="true">⌄</span></button> : null}
          {state.view === "browse" ? <label className={styles.kindSelect}><span className={styles.srOnly}>资源类型</span><select aria-label="资源类型" value={state.kind} onChange={(event) => updateState({ kind: event.target.value as ResourceKind | "all", readingType: "" })}><option value="all">全部类型</option>{RESOURCE_KINDS.map((kind) => <option key={kind} value={kind}>{RESOURCE_KIND_LABELS[kind]}</option>)}</select></label> : <p className={styles.readingIntro}>值得反复翻阅的文章、指南与方法。</p>}
          {state.view === "browse" ? <div className={styles.layoutSwitch} role="group" aria-label="显示方式">{(["grid", "list"] as const).map((layout) => <button key={layout} aria-label={layout === "grid" ? "网格视图" : "列表视图"} aria-pressed={state.layout === layout} className={state.layout === layout ? styles.layoutActive : ""} onClick={() => updateState({ layout, page: state.page }, true)}><LayoutIcon layout={layout} /></button>)}</div> : null}
        </div>
        {state.category && subcategories.length > 1 ? <div className={styles.subcategories} aria-label="细分用途"><button aria-pressed={!state.subcategory} onClick={() => updateState({ subcategory: "" })}>全部</button>{subcategories.map((subcategory) => <button key={subcategory} aria-pressed={state.subcategory === subcategory} onClick={() => updateState({ subcategory })}>{subcategory}</button>)}</div> : null}
        {hasFilters ? <div className={styles.filterChips} aria-label="已选筛选条件">
          {state.category ? <button onClick={() => updateState({ category: null, subcategory: "" })} aria-label={`移除用途筛选：${state.category}`}>{state.category}<span aria-hidden="true">×</span></button> : null}
          {state.kind !== "all" ? <button onClick={() => updateState({ kind: "all" })} aria-label={`移除类型筛选：${RESOURCE_KIND_LABELS[state.kind]}`}>{RESOURCE_KIND_LABELS[state.kind]}<span aria-hidden="true">×</span></button> : null}
          {state.readingType ? <button onClick={() => updateState({ readingType: "" })}>{state.readingType}<span aria-hidden="true">×</span></button> : null}
          {state.featuredOnly ? <button onClick={() => updateState({ featuredOnly: false })}>只看精选<span aria-hidden="true">×</span></button> : null}
          <button className={styles.clearFilters} onClick={clearFilters}>清除筛选</button>
        </div> : null}
        {!filteredResources.length ? <div className={styles.emptyState}><SearchIcon /><h3>暂时没有找到合适的资源</h3><p>{state.query.trim() ? "试试更短的名称、域名，或换个用途关键词。" : "这个筛选条件下还没有资源。"}</p><div>{hasFilters ? <button className={styles.secondaryButton} onClick={clearFilters}>清除筛选</button> : null}<button className={styles.primaryButton} onClick={() => { updateState({ view: "browse", category: null, subcategory: "", kind: "all", readingType: "", featuredOnly: false }); searchRef.current?.focus(); }}>在全库中搜索</button>{!state.query.trim() && !hasFilters ? <button className={styles.secondaryButton} onClick={() => changeView("featured")}>返回精选</button> : null}</div></div>
          : state.view === "reading" ? <PublicReadingList resources={visibleResources} onDetails={setSelectedResource} />
          : <div className={state.layout === "list" ? styles.resourceList : styles.resourceGrid}>{visibleResources.map((resource) => <PublicResourceCard key={resource.id} resource={resource} onDetails={setSelectedResource} layout={state.layout} />)}</div>}
        {remaining > 0 ? <div className={styles.loadMoreWrap}><button className={styles.secondaryButton} onClick={() => updateState({ page: state.page + 1 }, true)}>加载更多 <span aria-hidden="true">↓</span></button><p>已显示 {visibleResources.length} / {filteredResources.length} 个资源</p></div> : filteredResources.length > RESOURCE_PAGE_SIZE ? <p className={styles.endNote}>已显示全部 {filteredResources.length} 个资源</p> : null}
      </section>
    </div>}
    <dialog ref={filterDialogRef} className={styles.filterDialog} aria-labelledby="mobile-filter-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}><div className={styles.filterPanel}><div className={styles.filterHeading}><h2 id="mobile-filter-title">按用途查找</h2><button className={styles.closeButton} aria-label="关闭用途筛选" onClick={() => filterDialogRef.current?.close()}>×</button></div>{renderCategories()}</div></dialog>
    {selectedResource ? <PublicResourceDetail resource={selectedResource} onClose={() => setSelectedResource(null)} /> : null}
  </div>;
}
