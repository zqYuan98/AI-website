import type { PublicToolEntry, RecommendationEntry, RecommendationType } from "./curation";
import { isToolCategory, isToolSubcategory, type ToolCategory } from "./tool-taxonomy";

export type ExplorerView = "tools" | "recommendations";
export type RecommendationFilter = "全部" | RecommendationType;

export type ToolExplorerState = {
  view: ExplorerView;
  query: string;
  category: ToolCategory | null;
  subcategory: string;
  featuredOnly: boolean;
  recommendationType: RecommendationFilter;
};

export const DESKTOP_PAGE_SIZE = 36;
export const MOBILE_PAGE_SIZE = 18;

const STATE_PARAMS = ["view", "q", "category", "subcategory", "featured", "type"] as const;

/** Unknown values have safe defaults; a subcategory must belong to its parent. */
export function parseToolExplorerState(
  search: string,
  recommendationTypes: readonly RecommendationType[],
): ToolExplorerState {
  const params = new URLSearchParams(search);
  const rawCategory = params.get("category");
  const category = isToolCategory(rawCategory) ? rawCategory : null;
  const rawSubcategory = params.get("subcategory");
  const rawType = params.get("type");

  return {
    view: params.get("view") === "recommendations" ? "recommendations" : "tools",
    // Keep the input as typed (including IME text and spaces); normalize only for matching.
    query: params.get("q") ?? "",
    category,
    subcategory: category && isToolSubcategory(category, rawSubcategory) ? rawSubcategory : "",
    featuredOnly: params.get("featured") === "1",
    recommendationType: recommendationTypes.find((type) => type === rawType) ?? "全部",
  };
}

/** Own only these filters. Campaign parameters, duplicate unrelated keys and anchors survive. */
export function serializeToolExplorerState(state: ToolExplorerState, currentHref: string) {
  const url = new URL(currentHref);
  for (const key of STATE_PARAMS) url.searchParams.delete(key);
  if (state.view !== "tools") url.searchParams.set("view", state.view);
  if (state.query) url.searchParams.set("q", state.query);
  if (state.category) {
    url.searchParams.set("category", state.category);
    if (state.subcategory) url.searchParams.set("subcategory", state.subcategory);
  }
  if (state.featuredOnly) url.searchParams.set("featured", "1");
  if (state.recommendationType !== "全部") url.searchParams.set("type", state.recommendationType);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function normalizeToolQuery(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function indexFields(fields: Array<string | string[]>) {
  // Keep each field separate: a phrase must not match across unrelated fields.
  // Alternatives were already a single, space-joined field in the original matcher.
  return fields.map((field) => (Array.isArray(field) ? field.join(" ") : field).toLocaleLowerCase("zh-CN"));
}

export function indexTools(tools: PublicToolEntry[]) {
  return tools.map((tool) => {
    const hostname = getHostname(tool.url);
    return {
      tool,
      hostname,
      searchFields: indexFields([
        tool.name, hostname, tool.category, tool.subcategory, tool.scenario,
        tool.audience, tool.usage, tool.avoidWhen, tool.alternatives,
      ]),
    };
  });
}

export type IndexedTool = ReturnType<typeof indexTools>[number];

export function indexRecommendations(recommendations: RecommendationEntry[]) {
  return recommendations.map((item) => ({
    item,
    searchFields: indexFields([
      item.title, item.type, getHostname(item.url), item.verdict, item.boundary, item.learned,
    ]),
  }));
}

export function filterIndexedTools(index: IndexedTool[], state: ToolExplorerState) {
  const query = normalizeToolQuery(state.query);
  return index.filter(({ tool, searchFields }) =>
    (!state.category || tool.category === state.category) &&
    (!state.subcategory || tool.subcategory === state.subcategory) &&
    (!state.featuredOnly || tool.featured) &&
    (!query || searchFields.some((field) => field.includes(query))),
  );
}

export function filterIndexedRecommendations(
  index: ReturnType<typeof indexRecommendations>,
  state: ToolExplorerState,
) {
  const query = normalizeToolQuery(state.query);
  return index.filter(({ item, searchFields }) =>
    (state.recommendationType === "全部" || item.type === state.recommendationType) &&
    (!query || searchFields.some((field) => field.includes(query))),
  );
}

/** Explicitly loaded cards stay visible when the viewport crosses a breakpoint. */
export function getVisibleToolCounts(total: number, expandedCount: number) {
  return {
    desktop: Math.min(total, Math.max(DESKTOP_PAGE_SIZE, expandedCount)),
    mobile: Math.min(total, Math.max(MOBILE_PAGE_SIZE, expandedCount)),
  };
}
