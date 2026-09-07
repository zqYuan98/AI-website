import {
  RESOURCE_CATEGORIES,
  RESOURCE_KINDS,
  RESOURCE_KIND_LABELS,
  type PublicResource,
  type ResourceCategory,
  type ResourceKind,
} from "./resource-types";

export type ResourceView = "featured" | "browse" | "reading";
export type ResourceExplorerState = {
  view: ResourceView;
  query: string;
  category: ResourceCategory | null;
  subcategory: string;
  kind: ResourceKind | "all";
  readingType: string;
  featuredOnly: boolean;
  layout: "grid" | "list";
  page: number;
};

export const RESOURCE_PAGE_SIZE = 24;
export const READING_TYPES = ["长文", "指南", "文档", "框架", "工具包", "播客", "书"] as const;
const LEGACY_CATEGORIES: Record<string, ResourceCategory> = {
  "AI 工作流": "AI 与自动化",
  "产品与研究": "学习与研究",
  "设计与原型": "设计与创作",
  "开发与部署": "开发与技术",
  "写作与知识管理": "写作与知识",
  "效率与系统": "效率与生活",
};
const OWN_PARAMS = ["view", "q", "category", "subcategory", "kind", "type", "featured", "layout", "page"];

export function parseResourceExplorerState(search: string): ResourceExplorerState {
  const params = new URLSearchParams(search);
  const rawCategory = params.get("category") ?? "";
  const category = RESOURCE_CATEGORIES.find((item) => item === rawCategory) ?? LEGACY_CATEGORIES[rawCategory] ?? null;
  const rawKind = params.get("kind") ?? params.get("type");
  const kind = RESOURCE_KINDS.find((item) => item === rawKind) ?? "all";
  const readingType = READING_TYPES.find((item) => item === params.get("type")) ?? "";
  const rawView = params.get("view");
  const query = params.get("q") ?? "";
  const featuredOnly = params.get("featured") === "1";
  let view: ResourceView = "featured";
  if (rawView === "reading" || rawView === "recommendations") view = "reading";
  else if (rawView === "browse" || rawView === "tools" || query.trim() || category || kind !== "all" || featuredOnly || readingType) view = "browse";
  const parsedPage = Number(params.get("page") ?? "1");
  return {
    view,
    query,
    category,
    subcategory: category ? params.get("subcategory") ?? "" : "",
    kind,
    readingType,
    featuredOnly,
    layout: params.get("layout") === "list" ? "list" : "grid",
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 1000) : 1,
  };
}

/** Preserve unrelated campaign parameters and anchors when sharing public filters. */
export function serializeResourceExplorerState(state: ResourceExplorerState, currentHref: string) {
  const url = new URL(currentHref);
  OWN_PARAMS.forEach((key) => url.searchParams.delete(key));
  if (state.view !== "featured") url.searchParams.set("view", state.view);
  if (state.query) url.searchParams.set("q", state.query);
  if (state.category) url.searchParams.set("category", state.category);
  if (state.category && state.subcategory) url.searchParams.set("subcategory", state.subcategory);
  if (state.kind !== "all") url.searchParams.set("kind", state.kind);
  if (state.readingType) url.searchParams.set("type", state.readingType);
  if (state.featuredOnly) url.searchParams.set("featured", "1");
  if (state.layout !== "grid") url.searchParams.set("layout", state.layout);
  if (state.page > 1) url.searchParams.set("page", String(state.page));
  return `${url.pathname}${url.search}${url.hash}`;
}

export function resourceHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function resourceReadingType(resource: PublicResource) {
  return READING_TYPES.find((type) => type === resource.subcategory || resource.tags.includes(type)) ?? "文章";
}

export function indexPublicResources(resources: PublicResource[]) {
  return resources.map((resource) => ({
    resource,
    fields: [resource.name, resourceHostname(resource.url), resource.category, resource.subcategory,
      resource.description, resource.recommendation, resource.audience, resource.usage,
      RESOURCE_KIND_LABELS[resource.kind], resource.tags.join(" "), resource.alternatives.join(" ")]
      .map((field) => field.toLocaleLowerCase("zh-CN")),
  }));
}

export function filterPublicResources(index: ReturnType<typeof indexPublicResources>, state: ResourceExplorerState) {
  const query = state.query.trim().toLocaleLowerCase("zh-CN");
  return index.filter(({ resource, fields }) =>
    (state.view !== "reading" || resource.kind === "article") &&
    (!state.category || resource.category === state.category) &&
    (!state.subcategory || resource.subcategory === state.subcategory) &&
    (state.kind === "all" || resource.kind === state.kind) &&
    (!state.readingType || resourceReadingType(resource) === state.readingType) &&
    (!state.featuredOnly || resource.featured) &&
    (!query || fields.some((field) => field.includes(query))),
  ).map(({ resource }) => resource);
}
