"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type {
  RecommendationEntry,
  RecommendationType,
  PublicToolEntry,
} from "@/lib/curation";
import {
  TOOL_CATEGORIES,
  TOOL_SUBCATEGORIES,
  type ToolCategory,
} from "@/lib/tool-taxonomy";
import { ToolIcon } from "./tool-icon";
import styles from "./tools.module.css";

type View = "tools" | "recommendations";
type RecommendationFilter = "全部" | RecommendationType;

type ToolsExplorerProps = {
  tools: PublicToolEntry[];
  recommendations: RecommendationEntry[];
};

type LinkStatus = PublicToolEntry["linkStatus"];

const PAGE_SIZE = 36;

const views: { id: View; label: string }[] = [
  { id: "tools", label: "工具" },
  { id: "recommendations", label: "阅读与资源" },
];

const linkStatusLabels: Record<LinkStatus, string> = {
  ok: "可访问",
  restricted: "访问受限",
  unreachable: "本次未连通",
  unchecked: "尚未复核",
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function matches(
  searchable: Array<string | string[] | undefined>,
  query: string,
) {
  if (!query) return true;
  return searchable.some((value) =>
    (Array.isArray(value) ? value.join(" ") : (value ?? ""))
      .toLocaleLowerCase("zh-CN")
      .includes(query),
  );
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ExternalArrow() {
  return <span aria-hidden="true">↗</span>;
}

function ToolCard({ tool }: { tool: PublicToolEntry }) {
  const hasEditorialNote = Boolean(
    tool.scenario ||
      tool.audience ||
      tool.usage ||
      tool.avoidWhen ||
      tool.alternatives.length,
  );

  return (
    <article className={styles.toolCard}>
      <header className={styles.toolIdentity}>
        <ToolIcon name={tool.name} src={tool.icon || undefined} />
        <div className={styles.toolTitleGroup}>
          <h3>{tool.name}</h3>
          <p>{getHostname(tool.url)}</p>
        </div>
        {tool.usedByVitamin ? (
          <span className={styles.workflowBadge}>本站工作流在用</span>
        ) : tool.featured ? (
          <span className={styles.editorBadge}>维他命精选</span>
        ) : null}
      </header>

      <div className={styles.toolTags} role="group" aria-label="工具分类">
        <span>{tool.category}</span>
        {tool.subcategory ? <span>{tool.subcategory}</span> : null}
      </div>

      {hasEditorialNote ? (
        <details className={styles.editorialDetails}>
          <summary>
            {tool.usedByVitamin ? "查看使用与边界" : "查看策展短评"}
            <span aria-hidden="true">⌄</span>
          </summary>
          <dl className={styles.toolDetails}>
            {tool.scenario ? (
              <div>
                <dt>一句话场景</dt>
                <dd>{tool.scenario}</dd>
              </div>
            ) : null}
            {tool.audience ? (
              <div>
                <dt>适合谁</dt>
                <dd>{tool.audience}</dd>
              </div>
            ) : null}
            {tool.usage ? (
              <div>
                <dt>怎么进入工作</dt>
                <dd>{tool.usage}</dd>
              </div>
            ) : null}
            {tool.avoidWhen ? (
              <div className={styles.boundaryRow}>
                <dt>不选的情况</dt>
                <dd>{tool.avoidWhen}</dd>
              </div>
            ) : null}
            {tool.alternatives.length ? (
              <div>
                <dt>可比较</dt>
                <dd>{tool.alternatives.join(" · ")}</dd>
              </div>
            ) : null}
          </dl>
        </details>
      ) : null}

      <footer className={styles.toolFooter}>
        <span className={styles.linkStatus} data-status={tool.linkStatus}>
          {linkStatusLabels[tool.linkStatus]}
        </span>
        <a
          className={styles.outboundLink}
          href={tool.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`访问 ${tool.name}（在新标签打开）`}
        >
          打开工具 <ExternalArrow />
        </a>
      </footer>
    </article>
  );
}

function RecommendationCard({ item }: { item: RecommendationEntry }) {
  return (
    <article className={styles.resourceCard}>
      <div className={styles.cardTopline}>
        <span className={styles.itemNumber}>{String(item.order).padStart(2, "0")}</span>
        <span className={styles.itemType}>{item.type}</span>
        {item.featured ? <span className={styles.editorBadge}>优先阅读</span> : null}
      </div>

      <div className={styles.cardHeading}>
        <h3>{item.title}</h3>
        <p>{item.verdict}</p>
      </div>

      <dl className={styles.resourceDetails}>
        <div>
          <dt>适用边界</dt>
          <dd>{item.boundary}</dd>
        </div>
        <div>
          <dt>可带走</dt>
          <dd>{item.learned}</dd>
        </div>
      </dl>

      <div className={styles.cardFooter}>
        <time dateTime={item.updatedAt}>条目校对 · {item.updatedAt}</time>
        <div className={styles.linkCluster}>
          {item.relatedHref ? (
            <Link href={item.relatedHref} className={styles.relatedLink}>
              站内延伸 →
            </Link>
          ) : null}
          <a
            className={styles.outboundLink}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`阅读 ${item.title}（在新标签打开）`}
          >
            原始来源 <ExternalArrow />
          </a>
        </div>
      </div>
    </article>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className={styles.emptyState} role="status">
      <span className={styles.emptyMark} aria-hidden="true">
        0
      </span>
      <div>
        <h3>没有匹配项</h3>
        <p>换一个关键词，或清除当前分类。</p>
      </div>
      <button type="button" onClick={onReset}>
        清除筛选
      </button>
    </div>
  );
}

export function ToolsExplorer({ tools, recommendations }: ToolsExplorerProps) {
  const [activeView, setActiveView] = useState<View>("tools");
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [expandedCategories, setExpandedCategories] = useState<Set<ToolCategory>>(
    () => new Set([TOOL_CATEGORIES[0]]),
  );
  const [recommendationFilter, setRecommendationFilter] =
    useState<RecommendationFilter>("全部");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const recommendationTypes = useMemo(
    () => Array.from(new Set(recommendations.map((item) => item.type))),
    [recommendations],
  );
  const featuredCount = useMemo(
    () => tools.filter((tool) => tool.featured).length,
    [tools],
  );
  const taxonomyCounts = useMemo(() => {
    const categories = new Map<ToolCategory, number>();
    const subcategories = new Map<string, number>();

    for (const tool of tools) {
      categories.set(tool.category, (categories.get(tool.category) ?? 0) + 1);
      if (tool.subcategory) {
        const key = `${tool.category}\u0000${tool.subcategory}`;
        subcategories.set(key, (subcategories.get(key) ?? 0) + 1);
      }
    }

    return { categories, subcategories };
  }, [tools]);
  const normalizedQuery = normalize(query);

  const filteredTools = useMemo(
    () =>
      tools.filter(
        (tool) =>
          (!selectedCategory || tool.category === selectedCategory) &&
          (!selectedSubcategory || tool.subcategory === selectedSubcategory) &&
          (!featuredOnly || tool.featured) &&
          matches(
            [
              tool.name,
              getHostname(tool.url),
              tool.category,
              tool.subcategory,
              tool.scenario,
              tool.audience,
              tool.usage,
              tool.avoidWhen,
              tool.alternatives,
            ],
            normalizedQuery,
          ),
      ),
    [featuredOnly, normalizedQuery, selectedCategory, selectedSubcategory, tools],
  );
  const visibleTools = filteredTools.slice(0, visibleLimit);

  const visibleRecommendations = useMemo(
    () =>
      recommendations.filter(
        (item) =>
          (recommendationFilter === "全部" || item.type === recommendationFilter) &&
          matches(
            [
              item.title,
              item.type,
              getHostname(item.url),
              item.verdict,
              item.boundary,
              item.learned,
            ],
            normalizedQuery,
          ),
      ),
    [normalizedQuery, recommendationFilter, recommendations],
  );

  const activeCount =
    activeView === "tools" ? filteredTools.length : visibleRecommendations.length;
  const activeTotal = activeView === "tools" ? tools.length : recommendations.length;

  function activateView(index: number, moveFocus = false) {
    const view = views[index];
    if (!view) return;
    setActiveView(view.id);
    if (moveFocus) tabRefs.current[index]?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % views.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + views.length) % views.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = views.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    activateView(nextIndex, true);
  }

  function resetVisibleTools() {
    setVisibleLimit(PAGE_SIZE);
  }

  function selectTaxonomy(category: ToolCategory | null, subcategory = "") {
    setSelectedCategory(category);
    setSelectedSubcategory(subcategory);
    resetVisibleTools();
    if (category) {
      setExpandedCategories((current) => {
        const next = new Set(current);
        next.add(category);
        return next;
      });
    }
  }

  function toggleCategory(category: ToolCategory) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function handleMobileTaxonomy(value: string) {
    if (value === "all") {
      selectTaxonomy(null);
      return;
    }

    const [kind, categoryIndex, subcategoryIndex] = value.split(":");
    const category = TOOL_CATEGORIES[Number(categoryIndex)];
    if (!category) return;
    if (kind === "subcategory") {
      const subcategory = TOOL_SUBCATEGORIES[category][Number(subcategoryIndex)];
      if (subcategory) selectTaxonomy(category, subcategory);
      return;
    }
    selectTaxonomy(category);
  }

  function getMobileTaxonomyValue() {
    if (!selectedCategory) return "all";
    const categoryIndex = TOOL_CATEGORIES.indexOf(selectedCategory);
    if (!selectedSubcategory) return `category:${categoryIndex}`;
    const subcategoryIndex = TOOL_SUBCATEGORIES[selectedCategory].indexOf(
      selectedSubcategory,
    );
    return `subcategory:${categoryIndex}:${subcategoryIndex}`;
  }

  function resetActiveFilters() {
    setQuery("");
    if (activeView === "tools") {
      setSelectedCategory(null);
      setSelectedSubcategory("");
      setFeaturedOnly(false);
      resetVisibleTools();
    } else {
      setRecommendationFilter("全部");
    }
  }

  return (
    <div className={styles.explorer}>
      <div className={styles.explorerHeader}>
        <div className={styles.tabs} role="tablist" aria-label="工具箱内容">
          {views.map((view, index) => (
            <button
              key={view.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={`tab-${view.id}`}
              type="button"
              role="tab"
              aria-selected={activeView === view.id}
              aria-controls={`panel-${view.id}`}
              tabIndex={activeView === view.id ? 0 : -1}
              onClick={() => activateView(index)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {view.label}
              <span>{view.id === "tools" ? tools.length : recommendations.length}</span>
            </button>
          ))}
        </div>

        <div className={styles.searchBox}>
          <label className={styles.srOnly} htmlFor="curation-search">
            搜索工具名称、域名、用途或阅读资源
          </label>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
            <circle cx="11" cy="11" r="7" />
            <path d="m16.5 16.5 4 4" />
          </svg>
          <input
            id="curation-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              resetVisibleTools();
            }}
            placeholder="搜索名称、域名、用途…"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                resetVisibleTools();
              }}
              aria-label="清除搜索词"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
        当前匹配 {activeCount} 条，共 {activeTotal} 条。
        {activeView === "tools" ? `已显示 ${visibleTools.length} 条。` : ""}
      </p>

      <section
        id="panel-tools"
        role="tabpanel"
        aria-labelledby="tab-tools"
        tabIndex={0}
        hidden={activeView !== "tools"}
      >
        <h2 className={styles.srOnly}>工具收藏</h2>

        <div className={styles.mobileTaxonomy}>
          <label htmlFor="mobile-tool-category">浏览分类</label>
          <select
            id="mobile-tool-category"
            value={getMobileTaxonomyValue()}
            onChange={(event) => handleMobileTaxonomy(event.target.value)}
          >
            <option value="all">全部工具（{tools.length}）</option>
            {TOOL_CATEGORIES.map((category, categoryIndex) => {
              const populatedSubcategories = TOOL_SUBCATEGORIES[category].filter(
                (subcategory) =>
                  (taxonomyCounts.subcategories.get(`${category}\u0000${subcategory}`) ?? 0) >
                  0,
              );

              return (
                <optgroup key={category} label={category}>
                  <option value={`category:${categoryIndex}`}>
                    全部 · {category}（{taxonomyCounts.categories.get(category) ?? 0}）
                  </option>
                  {populatedSubcategories.map((subcategory) => (
                    <option
                      key={subcategory}
                      value={`subcategory:${categoryIndex}:${TOOL_SUBCATEGORIES[
                        category
                      ].indexOf(subcategory)}`}
                    >
                      {subcategory}（
                      {taxonomyCounts.subcategories.get(
                        `${category}\u0000${subcategory}`,
                      ) ?? 0}
                      ）
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        <div className={styles.catalogLayout}>
          <aside className={styles.taxonomySidebar} aria-label="工具分类">
            <div className={styles.taxonomyHeading}>
              <span>分类索引</span>
              <strong>6 个主类</strong>
            </div>
            <button
              className={styles.allToolsButton}
              type="button"
              aria-pressed={!selectedCategory}
              onClick={() => selectTaxonomy(null)}
            >
              <span>全部工具</span>
              <span>{tools.length}</span>
            </button>

            <div className={styles.categoryGroups}>
              {TOOL_CATEGORIES.map((category, categoryIndex) => {
                const isExpanded = expandedCategories.has(category);
                const populatedSubcategories = TOOL_SUBCATEGORIES[category].filter(
                  (subcategory) =>
                    (taxonomyCounts.subcategories.get(
                      `${category}\u0000${subcategory}`,
                    ) ?? 0) > 0,
                );
                const listId = `tool-subcategories-${categoryIndex}`;

                return (
                  <div className={styles.categoryGroup} key={category}>
                    <div className={styles.categoryRow}>
                      <button
                        className={styles.categorySelect}
                        type="button"
                        aria-pressed={
                          selectedCategory === category && !selectedSubcategory
                        }
                        onClick={() => selectTaxonomy(category)}
                      >
                        <span>{category}</span>
                        <span>{taxonomyCounts.categories.get(category) ?? 0}</span>
                      </button>
                      {populatedSubcategories.length ? (
                        <button
                          className={styles.expandButton}
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={listId}
                          aria-label={`${isExpanded ? "收起" : "展开"}${category}子分类`}
                          onClick={() => toggleCategory(category)}
                        >
                          <span aria-hidden="true">⌄</span>
                        </button>
                      ) : null}
                    </div>

                    {populatedSubcategories.length ? (
                      <ul
                        id={listId}
                        className={styles.subcategoryList}
                        hidden={!isExpanded}
                      >
                        {populatedSubcategories.map((subcategory) => (
                          <li key={subcategory}>
                            <button
                              type="button"
                              aria-pressed={
                                selectedCategory === category &&
                                selectedSubcategory === subcategory
                              }
                              onClick={() => selectTaxonomy(category, subcategory)}
                            >
                              <span>{subcategory}</span>
                              <span>
                                {taxonomyCounts.subcategories.get(
                                  `${category}\u0000${subcategory}`,
                                ) ?? 0}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </aside>

          <div className={styles.catalogMain}>
            <div className={styles.catalogToolbar}>
              <div
                className={styles.featuredToggle}
                role="group"
                aria-label="工具范围筛选"
              >
                <button
                  type="button"
                  aria-pressed={!featuredOnly}
                  onClick={() => {
                    setFeaturedOnly(false);
                    resetVisibleTools();
                  }}
                >
                  全部收藏 <span>{tools.length}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={featuredOnly}
                  onClick={() => {
                    setFeaturedOnly(true);
                    resetVisibleTools();
                  }}
                >
                  维他命精选 <span>{featuredCount}</span>
                </button>
              </div>
              <p className={styles.resultCount}>
                匹配 {filteredTools.length} · 已显示 {visibleTools.length}
              </p>
            </div>

            {filteredTools.length > 0 ? (
              <>
                <div className={styles.toolGrid}>
                  {visibleTools.map((tool) => (
                    <ToolCard key={tool.slug} tool={tool} />
                  ))}
                </div>
                {visibleTools.length < filteredTools.length ? (
                  <div className={styles.loadMoreWrap}>
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)}
                    >
                      再显示 {Math.min(PAGE_SIZE, filteredTools.length - visibleTools.length)} 个
                    </button>
                    <span>
                      {visibleTools.length} / {filteredTools.length}
                    </span>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState onReset={resetActiveFilters} />
            )}
          </div>
        </div>
      </section>

      <section
        id="panel-recommendations"
        role="tabpanel"
        aria-labelledby="tab-recommendations"
        tabIndex={0}
        hidden={activeView !== "recommendations"}
      >
        <h2 className={styles.srOnly}>阅读与资源</h2>
        <div className={styles.filterRow}>
          <span>按类型查看</span>
          <div className={styles.filterRail} role="group" aria-label="资源类型筛选">
            {(["全部", ...recommendationTypes] as RecommendationFilter[]).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={recommendationFilter === type}
                onClick={() => setRecommendationFilter(type)}
              >
                {type}
              </button>
            ))}
          </div>
          <span className={styles.resultCount} aria-hidden="true">
            {visibleRecommendations.length} / {recommendations.length}
          </span>
        </div>

        {visibleRecommendations.length > 0 ? (
          <div className={styles.resourceList}>
            {visibleRecommendations.map((item) => (
              <RecommendationCard key={item.slug} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState onReset={resetActiveFilters} />
        )}
      </section>
    </div>
  );
}
