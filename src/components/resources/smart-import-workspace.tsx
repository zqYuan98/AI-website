"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RESOURCE_CATEGORIES, RESOURCE_KINDS, RESOURCE_KIND_LABELS, type ResourceCategory } from "@/lib/resource-types";
import type { SmartImportBatchContext, SmartImportFilters, SmartImportGroup, SmartImportMutationResult, SmartImportPage, SmartImportSelection, SmartImportSource } from "@/lib/smart-import-types";
import { ManagerDialog, ManagerIcon } from "./manager-primitives";
import { SmartFeedback } from "./smart-import-feedback";
import { SmartImportDetail, SmartImportFieldsEditor, SmartImportSourceEditor } from "./smart-import-detail";
import { SmartImportCommit } from "./smart-import-commit";
import { SmartImportUndo } from "./smart-import-undo";
import { SmartImportCollection } from "./smart-import-collection";
import { SmartImportAI } from "./smart-import-analysis";
import { downloadSmartReport, SmartRequestError, smartDate, smartError, smartErrorStatus, smartRequest } from "./smart-api";
import styles from "./smart-import.module.css";
import resultStyles from "./smart-import-results.module.css";

type ResultView = "ready" | "review" | "skipped" | "collected" | "removed";
type SourceView = "invalid" | "excluded" | null;
type Dialog = "commit" | "undo" | "classify" | "cancel" | "delete" | null;
type InlineEdit = { value: ResourceCategory; batchRevision: string; failed: boolean };
const VIEWS: { id: ResultView; label: string }[] = [{ id: "ready", label: "建议收藏" }, { id: "review", label: "需你确认" }, { id: "collected", label: "已收藏" }, { id: "removed", label: "已移出" }, { id: "skipped", label: "已跳过" }];
function domainOf(url: string) { try { return new URL(url).hostname; } catch { return "链接待修正"; } }

export function SmartImportWorkspace({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [data, setData] = useState<SmartImportPage | null>(null);
  const [filters, setFilters] = useState<SmartImportFilters>({ resultStatus: "ready" });
  const [view, setView] = useState<ResultView>("ready");
  const [sourceView, setSourceView] = useState<SourceView>(null);
  const [showAI, setShowAI] = useState(false);
  const [loadedFilters, setLoadedFilters] = useState<SmartImportFilters | null>(null);
  const resultsPanel = useRef<HTMLElement | null>(null);
  const aiHeading = useRef<HTMLHeadingElement | null>(null);
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1); const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true); const [selectionLoaded, setSelectionLoaded] = useState(false);
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [status, setStatus] = useState(0); const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [readyIds, setReadyIds] = useState<string[]>([]); const [newReadyIds, setNewReadyIds] = useState<string[]>([]);
  const initializedSelection = useRef(false); const knownReadyIds = useRef<Set<string>>(new Set());
  const [inlineEdits, setInlineEdits] = useState<Record<string, InlineEdit>>({});
  const [dialog, setDialog] = useState<Dialog>(null); const [detail, setDetail] = useState<string | null>(null); const [source, setSource] = useState<SmartImportSource | null>(null);
  const [collectionAction, setCollectionAction] = useState<{ groupId: string; mode: "archive" | "restore" } | null>(null);
  const [actionContext, setActionContext] = useState<SmartImportBatchContext | null>(null); const [actionScope, setActionScope] = useState<string[]>([]);

  useEffect(() => { if (showAI) aiHeading.current?.focus({ preventScroll: true }); }, [showAI]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const result = await smartRequest<SmartImportPage>("imports", { action: "get", batchId, page, filters }, controller.signal);
        if (controller.signal.aborted) return;
        const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
        if (page > lastPage) { setPage(lastPage); return; }
        setData(result);
        setLoadedFilters(filters);
        const ready = await smartRequest<SmartImportSelection>("imports", { action: "select", batchId, batchRevision: result.batchRevision, filters: { resultStatus: "ready" } }, controller.signal);
        if (controller.signal.aborted) return;
        setReadyIds(ready.groupIds);
        if (!initializedSelection.current) {
          initializedSelection.current = true; knownReadyIds.current = new Set(ready.groupIds);
          setSelected(new Set(ready.groupIds)); setSelectionLoaded(true);
        } else {
          const stillReady = new Set(ready.groupIds);
          setSelected(previous => new Set([...previous].filter(id => stillReady.has(id))));
          setNewReadyIds(ready.groupIds.filter(id => !knownReadyIds.current.has(id)));
        }
      } catch (failure) { if (!controller.signal.aborted) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [batchId, filters, page, version]);

  function reload() { setError(""); setStatus(0); setLoading(true); setVersion(value => value + 1); }
  function changed(result: SmartImportBatchContext) { setData(previous => previous ? { ...previous, ...result } : previous); reload(); }
  function clearSelection() { setSelected(new Set()); }
  function regrouped(result: SmartImportBatchContext) { changed(result); clearSelection(); setMessage("来源已更新，请按最新的整理结果重新选择。其他修改都已保留。"); }
  function changeView(next: ResultView, nextSource: SourceView = null) { setView(next); setSourceView(nextSource); setShowAI(false); setPage(1); setSearch(""); setFilters(nextSource ? { view: nextSource } : { resultStatus: next }); setLoading(true); }
  function changeFilter(next: Partial<SmartImportFilters>) { setFilters(previous => ({ ...previous, ...next })); setPage(1); setLoading(true); }
  function clearFilters() { setSearch(""); setPage(1); setFilters(showAI ? { suggestionSource: "model" } : sourceView ? { view: sourceView } : { resultStatus: view }); setLoading(true); }
  function toggle(id: string) { setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  const allReadySelected = readyIds.length > 0 && readyIds.every(id => selected.has(id));
  function toggleAllReady() { setSelected(previous => { const next = new Set(previous); readyIds.forEach(id => { if (allReadySelected) next.delete(id); else next.add(id); }); return next; }); readyIds.forEach(id => knownReadyIds.current.add(id)); setNewReadyIds([]); }
  function selectNewReady() { const additions = newReadyIds.filter(id => !selected.has(id)); setSelected(previous => new Set([...previous, ...additions])); newReadyIds.forEach(id => knownReadyIds.current.add(id)); setMessage(`已把新增的 ${additions.length} 个资源加入本次选择。`); setNewReadyIds([]); }
  function openDialog(next: NonNullable<Dialog>) { if (!data) return; setActionContext(data); setActionScope([...selected]); setError(""); setDialog(next); }
  async function selectFiltered() {
    if (!data || busy) return; setBusy("select"); setError("");
    try { const result = await smartRequest<SmartImportSelection>("imports", { action: "select", batchId, batchRevision: data.batchRevision, filters: { ...filters, resultStatus: "ready" } }); setSelected(new Set(result.groupIds)); result.groupIds.forEach(id => knownReadyIds.current.add(id)); setNewReadyIds(previous => previous.filter(id => !result.groupIds.includes(id))); setMessage(`已选择筛选结果中的 ${result.total} 个资源，包含其他页。`); }
    catch (failure) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } finally { setBusy(""); }
  }
  async function saveCategory(group: SmartImportGroup, value: ResourceCategory, revision = data?.batchRevision) {
    if (!revision || busy) return; setInlineEdits(previous => ({ ...previous, [group.id]: { value, batchRevision: revision, failed: false } })); setBusy(group.id); setError("");
    try { const result = await smartRequest<SmartImportBatchContext>("imports", { action: "decide", batchId, batchRevision: revision, groupIds: [group.id], fields: { category: value } }); changed(result); setInlineEdits(previous => { const next = { ...previous }; delete next[group.id]; return next; }); setMessage("分类已保存，加入收藏时使用这项分类。"); }
    catch (failure) { setInlineEdits(previous => ({ ...previous, [group.id]: { value, batchRevision: revision, failed: true } })); setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } finally { setBusy(""); }
  }
  async function ignore(ids: string[], restore = false) {
    if (!data || !ids.length || busy) return; setBusy("ignore"); setError("");
    try { const result = await smartRequest<SmartImportBatchContext>("imports", { action: "decide", batchId, batchRevision: data.batchRevision, groupIds: ids, decision: restore ? "defer" : "ignore" }); changed(result); setSelected(previous => new Set([...previous].filter(id => !ids.includes(id)))); setMessage(restore ? "已恢复这项资源，可在整理结果中继续查看。" : `已跳过 ${ids.length} 个资源，原始记录仍保留。`); }
    catch (failure) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } finally { setBusy(""); }
  }
  async function batchAction(action: "refresh" | "pause" | "resume" | "cancel" | "delete") {
    const snapshot = dialog ? actionContext : data; if (!snapshot || busy) return; setBusy(action); setError("");
    try { const result = await smartRequest<SmartImportBatchContext | { deleted: true }>("imports", { action, batchId, batchRevision: snapshot.batchRevision }); if ("deleted" in result) { router.push("/tools/manage/imports"); return; } changed(result); setDialog(null); setMessage(action === "pause" ? "已暂停，修改和已收藏资源都已保留。" : action === "resume" ? "可以继续处理剩余资源。" : action === "cancel" ? "已取消后续整理，已收藏资源会保留。" : "已重新核对重复关系，当前选择保持不变。"); }
    catch (failure) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } finally { setBusy(""); }
  }
  async function report() {
    if (!data || busy) return; setBusy("report"); setError("");
    try {
      const groups: SmartImportPage["groups"] = [], invalid: SmartImportSource[] = [], excluded: SmartImportSource[] = []; let revision = ""; let batch = data.batch;
      for (const reportView of ["all", "invalid", "excluded"] as const) { let current = 1, total = 1; do { const result = await smartRequest<SmartImportPage>("imports", { action: "get", batchId, page: current, filters: { view: reportView } }); if (revision && result.batchRevision !== revision) throw new SmartRequestError("整理结果在导出期间发生变化，请重新下载报告。", 409); revision = result.batchRevision; batch = result.batch; groups.push(...result.groups); if (reportView === "excluded") excluded.push(...result.invalidSources); else invalid.push(...result.invalidSources); total = Math.ceil(result.total / 50); current += 1; } while (current <= total); }
      downloadSmartReport({ exportedAt: new Date().toISOString(), batch, groups, invalidSources: invalid, excludedSources: excluded }, `import-report-${batchId}.json`); setMessage("已下载这份书签的整理报告。");
    } catch (failure) { setError(smartError(failure)); setStatus(smartErrorStatus(failure)); } finally { setBusy(""); }
  }
  function submitSearch(event: FormEvent) { event.preventDefault(); changeFilter({ search: search.trim() || undefined }); }
  function showAIResults() { setShowAI(true); setSourceView(null); setFilters({ suggestionSource: "model" }); setPage(1); setSearch(""); setLoading(true); resultsPanel.current?.scrollIntoView({ block: "start" }); aiHeading.current?.focus({ preventScroll: true }); }
  function collectionChanged(result: SmartImportMutationResult, mode: "archive" | "restore") { changed(result); setMessage(result.replayed ? "已确认此前操作，已刷新当前收藏状态。" : mode === "archive" ? "已移出收藏，可在“已移出”中恢复。" : "已恢复收藏：已整理，仅自己可见。"); }
  const showCollected = !showAI && view === "collected";
  const showRemoved = !showAI && view === "removed";
  const summary = data?.batch.summary, counts = summary?.resultCounts;
  const remainingCount = (counts?.ready ?? 0) + (counts?.review ?? 0);
  const disabled = loading || Boolean(busy) || !selectionLoaded;
  const hasUnsavedCategory = Object.keys(inlineEdits).length > 0;
  const paused = data?.batch.status === "paused" || data?.batch.status === "cancelled";
  const unselectedNew = newReadyIds.filter(id => !selected.has(id));
  const tabsCount = (id: ResultView) => id === "skipped" ? summary?.skippedSources ?? 0 : counts?.[id] ?? 0;
  // Never offer collection actions under a new tab or page using the previous rows.
  const listData = loadedFilters === filters && data?.page === page ? data : null;

  function resourceRow(group: SmartImportGroup) {
    const proposal = group.currentCollection?.resource ?? group.proposal.fields, draft = inlineEdits[group.id];
    const currentUrl = group.currentCollection?.resource?.url ?? group.representative.url;
    const editable = !group.readOnly && group.resultStatus !== "skipped", ready = group.resultStatus === "ready";
    const needsCategory = group.resultStatus === "review" && !group.categoryConfirmed && group.suggestion?.confidence !== "clear" && group.decision !== "keep";
    return <li key={group.id} className={`${styles.resultRow} ${selected.has(group.id) ? styles.resultRowSelected : ""}`}>
      {ready ? <label className={styles.resultCheckbox}><input type="checkbox" aria-label={`选择 ${proposal.name}`} checked={selected.has(group.id)} disabled={disabled} onChange={() => toggle(group.id)} /></label> : <span className={styles.resultRowMark} aria-hidden="true">{group.resultStatus === "collected" ? "✓" : group.resultStatus === "skipped" ? "—" : "·"}</span>}
      <div className={styles.resultResource}><div className={styles.resultResourceHeading}><button type="button" className={styles.resultName} onClick={() => setDetail(group.id)}>{proposal.name || "未命名资源"}</button><span className={styles.resultDomain}>{domainOf(currentUrl)}</span></div>{proposal.description ? <p className={styles.resultDescription}>{proposal.description}</p> : null}<div className={styles.resultMeta}><span>{RESOURCE_KIND_LABELS[proposal.kind]}</span>{!group.currentCollection && group.suggestion?.source === "model" ? <span className={styles.proposalSource}>保留 AI 建议</span> : !group.currentCollection && group.proposal.adoptedFields.length > 0 && group.suggestion ? <span className={styles.proposalSource}>规则分类</span> : null}{showAI ? <span className={resultStyles.rowState}>{{ ready: "建议收藏", review: "需你确认", skipped: "已跳过", collected: "已收藏", removed: "已移出" }[group.resultStatus]}</span> : null}{proposal.tags.length ? <span>{proposal.tags.slice(0, 3).join(" · ")}</span> : null}</div>{group.suggestion?.source === "model" && !group.readOnly && group.proposal.retainedFields.length > 0 ? <p className={resultStyles.manualNote}>人工填写的内容已保留。</p> : null}{group.resultStatus === "review" || group.resultStatus === "skipped" || group.resultStatus === "removed" ? <p className={styles.resultReason}>{group.resultReasons.join("；")}</p> : null}
        <details className={styles.resultSource}><summary>来源{group.sourceCount > 1 ? ` · ${group.sourceCount} 条书签` : "与详情"}</summary><p>{group.representative.sourceFolder || "未分文件夹"}</p><p className={styles.fullUrl}>{group.representative.url}</p>{group.sourceCount > 1 ? <p>{group.sourceCount} 条书签对应这个资源，加入收藏时只新增一次。</p> : null}<div className={styles.inlineActions}><button type="button" className={styles.textLink} onClick={() => setDetail(group.id)}>查看完整详情</button>{!group.readOnly && group.decision !== "ignore" ? <button type="button" className={styles.textLink} disabled={disabled} onClick={() => void ignore([group.id])}>跳过此资源</button> : null}</div></details>
      </div>
      <div className={styles.resultCategory}>{editable ? <label><span>{needsCategory ? "选择分类" : "拟用分类"}</span><select aria-label={`修改 ${proposal.name} 的分类`} value={draft?.value ?? (needsCategory ? "" : proposal.category)} disabled={disabled} onChange={event => void saveCategory(group, event.target.value as ResourceCategory)}>{needsCategory ? <option value="" disabled>选择合适分类</option> : null}{RESOURCE_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label> : <span className={styles.resultSavedCategory}>{proposal.category}</span>}
        {draft?.failed ? <div className={styles.inlineSaveError}><span>分类尚未保存</span><button type="button" className={styles.textLink} disabled={Boolean(busy)} onClick={() => void saveCategory(group, draft.value, draft.batchRevision)}>重试保存</button><button type="button" className={styles.textLink} disabled={Boolean(busy)} onClick={() => setInlineEdits(previous => { const next = { ...previous }; delete next[group.id]; return next; })}>取消修改</button></div> : null}
        {group.currentCollection?.resource ? <button type="button" className={group.currentCollection.state === "archived" ? resultStyles.restoreButton : resultStyles.removeButton} disabled={disabled} onClick={() => setCollectionAction({ groupId: group.id, mode: group.currentCollection?.state === "archived" ? "restore" : "archive" })}>{group.currentCollection.state === "archived" ? "恢复收藏" : "移出收藏"}</button> : null}
        {group.resultStatus === "review" ? <button type="button" className={styles.textLink} onClick={() => setDetail(group.id)}>处理这项资源 →</button> : group.decision === "ignore" && !group.readOnly ? <button type="button" className={styles.textLink} disabled={disabled} onClick={() => void ignore([group.id], true)}>恢复到整理结果</button> : null}
      </div>
    </li>;
  }

  return <div className={styles.simplifiedWorkbench}>
    <nav className={styles.importSteps} aria-label="导入进度"><Link href="/tools/manage/imports"><span>✓</span>导入文件</Link><i aria-hidden="true" /><strong aria-current="step"><span>2</span>整理结果</strong><i aria-hidden="true" /><span><b>3</b>完成</span></nav>
    <header className={styles.resultsHeading}><div><h1>{!data ? "正在读取这批资源…" : remainingCount ? "检查并收藏这批资源" : "这批资源暂无待收藏项"}</h1><p>{summary ? <><strong>{remainingCount}</strong> 个资源还未收藏，其中 <strong>{counts?.review ?? 0}</strong> 个需你确认。</> : "正在核对重复链接与基础分类。"}</p></div>{data ? <span className={styles.resultBatchName}>{data.batch.name}</span> : null}</header>
    {data ? <SmartImportAI context={data} refreshVersion={version} onResults={reload} onViewResults={showAIResults} selectedIds={[...selected]} /> : null}
    {paused ? <div className={styles.resumeNotice}><p>整理已暂停，修改和已收藏资源都已保留。</p><button type="button" className={styles.secondaryButton} disabled={disabled} onClick={() => void batchAction("resume")}>继续整理</button></div> : null}
    {unselectedNew.length ? <div className={styles.newSuggestions} role="status"><p>新增 <strong>{unselectedNew.length}</strong> 个分类明确的资源，原有选择保持不变。</p><button type="button" className={styles.textLink} disabled={disabled} onClick={selectNewReady}>选中新增 {unselectedNew.length} 个</button></div> : null}
    {!dialog ? <SmartFeedback error={error} status={status} message={message} onRefresh={reload} /> : null}
    <section ref={resultsPanel} className={styles.resultsPanel} aria-label="书签整理结果">
      <nav className={styles.resultTabs} aria-label="整理结果视图">{VIEWS.map(item => <button key={item.id} type="button" aria-pressed={view === item.id && !showAI} onClick={() => changeView(item.id)}>{item.label}<span>{tabsCount(item.id).toLocaleString()}</span></button>)}</nav>
      {showAI ? <div className={resultStyles.aiView}><div><h2 ref={aiHeading} tabIndex={-1}>AI 建议{listData ? ` · 当前显示 ${listData.total} 个资源` : ""}</h2><p>查看本批目前保留 AI 建议的资源，包含不同整理状态。未收藏项展示拟用内容，已收藏项展示收藏库的最新内容；查看不会扩大已选范围。</p></div><button type="button" className={styles.textLink} onClick={() => changeView("ready")}>返回建议收藏</button></div> : null}
      {view === "skipped" && !showCollected && !showAI && summary ? <div className={styles.skippedReasons}><span>共 {summary.skippedSources} 条书签，原始记录保留。</span><div><button type="button" aria-pressed={!sourceView} onClick={() => changeView("skipped")}>已有或已忽略 {counts?.skipped ?? 0} 个资源</button><button type="button" aria-pressed={sourceView === "invalid"} onClick={() => changeView("skipped", "invalid")}>无效 {summary.invalidSources} 条</button><button type="button" aria-pressed={sourceView === "excluded"} onClick={() => changeView("skipped", "excluded")}>已排除 {summary.excludedSources} 条</button></div></div> : null}
      {showCollected ? <div className={styles.resultListToolbar}><strong>已收藏 · {counts?.collected ?? 0} 条记录</strong><button type="button" className={styles.textLink} onClick={() => changeView("removed")}>查看已移出 {counts?.removed ?? 0} 条</button><span className={styles.help}>逐条移出不再需要的收藏，之后仍可恢复。</span></div> : showRemoved ? <p className={styles.reviewIntro}>这里保留已移出的收藏记录，可恢复为已整理、仅自己可见。已不存在的收藏会保留来源说明。</p> : !showAI && view === "ready" ? <div className={styles.resultListToolbar}><label className={styles.checkLabel}><input type="checkbox" checked={allReadySelected} disabled={disabled || !readyIds.length} onChange={toggleAllReady} />{allReadySelected ? `已选全部 ${readyIds.length} 个建议资源` : `选择全部 ${readyIds.length} 个建议资源`}<span>包含其他页</span></label><span className={styles.help}>分类可直接调整，无需逐条确认。</span></div> : !showAI && view === "review" ? <p className={styles.reviewIntro}>补充分类或处理重复关系后，资源会进入“建议收藏”，由你选择加入。</p> : null}
      {loading && !listData ? <p className={styles.loading} role="status">正在读取整理结果…</p> : listData?.total ? <>{sourceView ? <ul className={styles.resultRows}>{listData.invalidSources.map(item => <li key={item.id} className={styles.skippedSourceRow}><div><strong>{item.name || "未命名书签"}</strong><p className={styles.fullUrl}>{item.url}</p><p>{item.excluded ? "已排除，未参与分类与收藏。" : item.invalidReason}</p></div><button type="button" className={styles.secondaryButton} onClick={() => setSource(item)}>{item.excluded ? "查看与恢复" : "修正链接"}</button></li>)}</ul> : <ul className={styles.resultRows} aria-label="本页资源">{listData.groups.map(resourceRow)}</ul>}
        <div className={styles.pagination}><span>第 {listData.page} / {Math.max(1, Math.ceil(listData.total / 50))} 页 · 共 {listData.total} {sourceView ? "条书签" : "个资源"}</span><div><button type="button" className={styles.secondaryButton} disabled={page <= 1 || Boolean(busy)} onClick={() => { setLoading(true); setPage(value => value - 1); }}>上一页</button><button type="button" className={styles.secondaryButton} disabled={page * 50 >= listData.total || Boolean(busy)} onClick={() => { setLoading(true); setPage(value => value + 1); }}>下一页</button></div></div>
      </> : <div className={styles.resultsEmpty}><ManagerIcon name="check" /><h2>{showCollected ? "当前筛选下没有已收藏记录" : showRemoved ? "这里还没有已移出记录" : showAI ? "当前筛选下还没有保留的 AI 建议" : view === "ready" ? "暂时没有新的建议收藏" : view === "review" ? "没有需要你确认的资源" : "这里没有已跳过的记录"}</h2><p>{showAI ? "可清除筛选查看本批建议，或返回上方确认发送范围后开始 AI 整理。" : view === "ready" && counts?.review ? "可以让 AI 进一步整理，或亲自确认剩余资源。" : "分类、选择与已收藏的结果都会保留。"}</p>{!showAI && view === "ready" && counts?.review ? <button type="button" className={styles.secondaryButton} onClick={() => changeView("review")}>查看需确认的 {counts.review} 个资源</button> : <button type="button" className={styles.textLink} onClick={clearFilters}>清除筛选</button>}</div>}
      <details className={styles.resultAdvanced}><summary>整理详情与更多操作</summary><div className={styles.advancedBody}>
        <form className={styles.filterSearch} onSubmit={submitSearch}><div><ManagerIcon name="search" /><input type="search" aria-label="搜索这份书签" placeholder="搜索标题、链接或用途…" value={search} onChange={event => setSearch(event.target.value)} /></div><button type="submit" className={styles.secondaryButton}>搜索</button></form>
        <div className={styles.filters}><select aria-label="来源文件夹" value={filters.folder ?? ""} onChange={event => changeFilter({ folder: event.target.value || undefined })}><option value="">全部文件夹</option>{data?.facets.folders.map(item => <option key={item.value} value={item.value}>{item.value || "未分文件夹"}（{item.count}）</option>)}</select><select aria-label="主域名" value={filters.domain ?? ""} onChange={event => changeFilter({ domain: event.target.value || undefined })}><option value="">全部域名</option>{data?.facets.domains.map(item => <option key={item.value} value={item.value}>{item.value}（{item.count}）</option>)}</select><select aria-label="资源类型" value={filters.kind ?? ""} onChange={event => changeFilter({ kind: (event.target.value || undefined) as SmartImportFilters["kind"] })}><option value="">全部类型</option>{RESOURCE_KINDS.map(kind => <option key={kind} value={kind}>{RESOURCE_KIND_LABELS[kind]}</option>)}</select><select aria-label="用途分类" value={filters.category ?? ""} onChange={event => changeFilter({ category: (event.target.value || undefined) as SmartImportFilters["category"] })}><option value="">全部用途</option>{RESOURCE_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select><button type="button" className={styles.textLink} onClick={clearFilters}>清除筛选</button></div>
        <div className={styles.advancedActions}>{showAI || (view === "ready" && !showCollected) ? <button type="button" className={styles.textLink} disabled={disabled} onClick={selectFiltered}>选择当前筛选的可收藏资源</button> : null}<button type="button" className={styles.textLink} disabled={disabled || !selected.size} onClick={() => openDialog("classify")}>批量调整所选分类</button><button type="button" className={styles.textLink} disabled={disabled || !selected.size} onClick={() => void ignore([...selected])}>跳过所选资源</button><button type="button" className={styles.textLink} disabled={disabled || !selected.size} onClick={clearSelection}>取消全部选择</button></div>
        {summary ? <p className={styles.help}>原始 {summary.rawTotal} 条书签：{summary.validSources} 条有效，{summary.invalidSources} 条无效，{summary.excludedSources} 条已排除。有效书签中有 {summary.duplicateSources} 条重复来源，归在对应资源详情中。{data?.batch.name ? `文件：${data.batch.name}。` : ""}</p> : null}
        <div className={styles.advancedActions}><button type="button" className={styles.textLink} disabled={disabled} onClick={() => changeView("collected")}>查看已收藏 {counts?.collected ?? 0} 条记录</button><Link className={styles.textLink} href={`/tools/manage?batchId=${encodeURIComponent(batchId)}`}>在收藏库查看</Link><button type="button" className={styles.textLink} disabled={disabled} onClick={report}>{busy === "report" ? "正在汇总…" : "导出整理报告"}</button><button type="button" className={styles.textLink} disabled={disabled} onClick={() => void batchAction("refresh")}>重新核对重复</button><button type="button" className={styles.textLink} disabled={disabled} onClick={() => openDialog("undo")}>撤回本批私有新增</button><button type="button" className={styles.textLink} disabled={disabled} onClick={() => void batchAction(paused ? "resume" : "pause")}>{paused ? "继续整理" : "暂停整理"}</button><button type="button" className={styles.textLink} disabled={disabled} onClick={() => openDialog("cancel")}>取消后续整理</button><button type="button" className={styles.dangerLink} disabled={disabled} onClick={() => openDialog("delete")}>删除这份导入记录</button></div>
      </div></details>
    </section>
    <p className={styles.resultFootnote}>{data ? `更新于 ${smartDate(data.batch.updatedAt)}。` : ""}加入收藏仅自己可见，公开发布仍是单独一步。</p>
    {!dialog && !collectionAction && !detail && !showCollected && !showRemoved ? <div className={styles.collectDock} aria-label="确认加入收藏"><div><strong>{selectionLoaded ? `已选 ${selected.size} 个资源` : "正在确定收藏范围…"}</strong><span>{showAI ? "包含其他页和其他视图 · 仅自己可见" : "包含其他页 · 仅自己可见"}</span></div><button type="button" className={styles.primaryButton} disabled={disabled || !selected.size || paused || hasUnsavedCategory} onClick={() => openDialog("commit")}>将 {selected.size} 条加入我的收藏 <span aria-hidden="true">→</span></button></div> : null}
    {collectionAction ? <SmartImportCollection batchId={batchId} groupId={collectionAction.groupId} mode={collectionAction.mode} onClose={() => { setCollectionAction(null); reload(); }} onChanged={collectionChanged} /> : null}
    {detail && data ? <SmartImportDetail context={data} groupId={detail} onClose={() => setDetail(null)} onChanged={changed} onRegrouped={regrouped} /> : null}
    {source && data ? <SmartImportSourceEditor context={data} source={source} onClose={() => setSource(null)} onChanged={regrouped} /> : null}
    {dialog === "classify" && actionContext ? <SmartImportFieldsEditor context={actionContext} groupIds={actionScope} onClose={() => setDialog(null)} onChanged={changed} /> : null}
    {dialog === "commit" && actionContext ? <SmartImportCommit context={actionContext} groupIds={actionScope} onClose={() => { setDialog(null); reload(); }} onChanged={changed} onUndo={() => { if (data) { setActionContext(data); setDialog("undo"); } clearSelection(); }} /> : null}
    {dialog === "undo" && actionContext ? <SmartImportUndo context={actionContext} onClose={() => { setDialog(null); clearSelection(); }} onChanged={changed} /> : null}
    {(dialog === "cancel" || dialog === "delete") && actionContext ? <ManagerDialog title={dialog === "delete" ? "删除这份导入记录？" : "取消后续整理？"} description={dialog === "delete" ? "来源与未处理记录删除后不能恢复。已收藏的资源会保留。请先取消尚未完成的整理。" : "修改、来源和已收藏资源都会保留，以后还可以继续整理。"} onClose={() => setDialog(null)} busy={Boolean(busy)}><div className={styles.dialogBody}><SmartFeedback error={error} status={status} /><div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => setDialog(null)}>返回</button><button type="button" className={styles.dangerButton} disabled={Boolean(busy)} onClick={() => void batchAction(dialog)}>{busy ? "正在处理…" : dialog === "delete" ? "确认删除记录" : "确认取消"}</button></div></div></ManagerDialog> : null}
  </div>;
}
