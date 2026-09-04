"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type {
  RecommendationEntry,
  RecommendationType,
  ToolCategory,
  ToolEntry,
} from "@/lib/curation";
import styles from "./tools.module.css";

type View = "tools" | "recommendations";
type ToolFilter = "全部" | ToolCategory;
type RecommendationFilter = "全部" | RecommendationType;

type ToolsExplorerProps = {
  tools: ToolEntry[];
  recommendations: RecommendationEntry[];
};

const views: { id: View; label: string }[] = [
  { id: "tools", label: "工具" },
  { id: "recommendations", label: "阅读与资源" },
];

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function matches(searchable: Array<string | string[]>, query: string) {
  if (!query) return true;
  return searchable.some((value) =>
    (Array.isArray(value) ? value.join(" ") : value)
      .toLocaleLowerCase("zh-CN")
      .includes(query),
  );
}

function ExternalArrow() {
  return <span aria-hidden="true">↗</span>;
}

function ToolCard({ tool }: { tool: ToolEntry }) {
  return (
    <article className={styles.toolCard}>
      <div className={styles.cardTopline}>
        <span className={styles.itemNumber}>{String(tool.order).padStart(2, "0")}</span>
        <span className={styles.itemType}>{tool.category}</span>
        {tool.usedByVitamin ? (
          <span className={styles.workflowBadge}>本站工作流在用</span>
        ) : null}
      </div>

      <div className={styles.cardHeading}>
        <h3>{tool.name}</h3>
        <p>{tool.scenario}</p>
      </div>

      <dl className={styles.toolDetails}>
        <div>
          <dt>适合谁</dt>
          <dd>{tool.audience}</dd>
        </div>
        <div>
          <dt>怎么进入工作</dt>
          <dd>{tool.usage}</dd>
        </div>
        <div className={styles.boundaryRow}>
          <dt>不选的情况</dt>
          <dd>{tool.avoidWhen}</dd>
        </div>
      </dl>

      <div className={styles.cardFooter}>
        <div className={styles.alternatives}>
          <span>可比较</span>
          <span>{tool.alternatives.join(" · ")}</span>
        </div>
        <a
          className={styles.outboundLink}
          href={tool.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`访问 ${tool.name}（在新标签打开）`}
        >
          访问 <ExternalArrow />
        </a>
      </div>
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
  const [toolFilter, setToolFilter] = useState<ToolFilter>("全部");
  const [recommendationFilter, setRecommendationFilter] =
    useState<RecommendationFilter>("全部");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const toolCategories = useMemo(
    () => Array.from(new Set(tools.map((tool) => tool.category))),
    [tools],
  );
  const recommendationTypes = useMemo(
    () => Array.from(new Set(recommendations.map((item) => item.type))),
    [recommendations],
  );
  const normalizedQuery = normalize(query);

  const visibleTools = useMemo(
    () =>
      tools.filter(
        (tool) =>
          (toolFilter === "全部" || tool.category === toolFilter) &&
          matches(
            [
              tool.name,
              tool.category,
              tool.scenario,
              tool.audience,
              tool.usage,
              tool.avoidWhen,
              tool.alternatives,
            ],
            normalizedQuery,
          ),
      ),
    [normalizedQuery, toolFilter, tools],
  );

  const visibleRecommendations = useMemo(
    () =>
      recommendations.filter(
        (item) =>
          (recommendationFilter === "全部" || item.type === recommendationFilter) &&
          matches(
            [item.title, item.type, item.verdict, item.boundary, item.learned],
            normalizedQuery,
          ),
      ),
    [normalizedQuery, recommendationFilter, recommendations],
  );

  const activeCount =
    activeView === "tools" ? visibleTools.length : visibleRecommendations.length;
  const activeTotal = activeView === "tools" ? tools.length : recommendations.length;

  function activateView(index: number, moveFocus = false) {
    const view = views[index];
    if (!view) return;
    setActiveView(view.id);
    if (moveFocus) tabRefs.current[index]?.focus();
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % views.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + views.length) % views.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = views.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    activateView(nextIndex, true);
  }

  function resetActiveFilters() {
    setQuery("");
    if (activeView === "tools") setToolFilter("全部");
    else setRecommendationFilter("全部");
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
            搜索工具、场景或资源
          </label>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
            <circle cx="11" cy="11" r="7" />
            <path d="m16.5 16.5 4 4" />
          </svg>
          <input
            id="curation-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、场景、边界…"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="清除搜索词">
              ×
            </button>
          ) : null}
        </div>
      </div>

      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
        当前显示 {activeCount} 条，共 {activeTotal} 条。
      </p>

      <section
        id="panel-tools"
        role="tabpanel"
        aria-labelledby="tab-tools"
        tabIndex={0}
        hidden={activeView !== "tools"}
      >
        <h2 className={styles.srOnly}>精选工具</h2>
        <div className={styles.filterRow}>
          <span>按分类查看</span>
          <div className={styles.filterRail} role="group" aria-label="工具分类筛选">
            {(["全部", ...toolCategories] as ToolFilter[]).map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={toolFilter === category}
                onClick={() => setToolFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <span className={styles.resultCount} aria-hidden="true">
            {visibleTools.length} / {tools.length}
          </span>
        </div>

        {visibleTools.length > 0 ? (
          <div className={styles.toolGrid}>
            {visibleTools.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        ) : (
          <EmptyState onReset={resetActiveFilters} />
        )}
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
