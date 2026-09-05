import "server-only";

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { TOOL_CATEGORIES, isToolSubcategory, type ToolCategory } from "./tool-taxonomy";
import { canonicalToolUrl, validatedToolUrl } from "./tool-url";

const CONTENT_ROOT = path.join(process.cwd(), "content");

export { TOOL_CATEGORIES } from "./tool-taxonomy";
export type { ToolCategory } from "./tool-taxonomy";

export const RECOMMENDATION_TYPES = [
  "长文",
  "指南",
  "文档",
  "框架",
  "工具包",
  "播客",
  "书",
] as const;

export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export type ToolEntry = {
  slug: string;
  name: string;
  category: ToolCategory;
  subcategory: string;
  icon: string;
  collectionSource: string;
  sourceCategories: string[];
  linkStatus: "ok" | "restricted" | "unreachable" | "unchecked";
  scenario: string;
  audience: string;
  usage: string;
  avoidWhen: string;
  alternatives: string[];
  url: string;
  usedByVitamin: boolean;
  featured: boolean;
  updatedAt: string;
  order: number;
};

export type RecommendationEntry = {
  slug: string;
  title: string;
  type: RecommendationType;
  verdict: string;
  boundary: string;
  learned: string;
  url: string;
  relatedHref: string;
  featured: boolean;
  updatedAt: string;
  order: number;
};

export type PublicToolEntry = Omit<ToolEntry, "collectionSource" | "sourceCategories" | "updatedAt" | "order">;

/** Keep import bookkeeping on the server, outside the public page payload. */
export function toPublicTool(tool: ToolEntry): PublicToolEntry {
  return {
    slug: tool.slug,
    name: tool.name,
    category: tool.category,
    subcategory: tool.subcategory,
    icon: tool.icon,
    linkStatus: tool.linkStatus,
    scenario: tool.scenario,
    audience: tool.audience,
    usage: tool.usage,
    avoidWhen: tool.avoidWhen,
    alternatives: tool.alternatives,
    url: tool.url,
    usedByVitamin: tool.usedByVitamin,
    featured: tool.featured,
  };
}

const TOOL_FIELDS = [
  "name",
  "category",
  "scenario",
  "audience",
  "usage",
  "avoidWhen",
  "alternatives",
  "url",
  "usedByVitamin",
  "featured",
  "updatedAt",
  "order",
] as const;

const RECOMMENDATION_FIELDS = [
  "title",
  "type",
  "verdict",
  "boundary",
  "learned",
  "url",
  "relatedHref",
  "featured",
  "updatedAt",
  "order",
] as const;

function fail(file: string, field: string, reason: string): never {
  throw new Error(`[curation] ${file}: frontmatter field "${field}" ${reason}`);
}

function readMarkdownDirectory(directory: "tools" | "recommendations") {
  const absoluteDirectory = path.join(CONTENT_ROOT, directory);
  if (!fs.existsSync(absoluteDirectory)) {
    throw new Error(`[curation] Missing content directory: content/${directory}`);
  }

  const files = fs
    .readdirSync(absoluteDirectory)
    .filter((file) => file.endsWith(".md"))
    .sort();

  if (files.length === 0) {
    throw new Error(`[curation] content/${directory} must contain at least one .md file`);
  }

  return files.map((file) => {
    const slug = file.replace(/\.md$/, "");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(
        `[curation] content/${directory}/${file}: filename must be a lowercase kebab-case slug`,
      );
    }

    const source = fs.readFileSync(path.join(absoluteDirectory, file), "utf8");
    const parsed = matter(source);
    return {
      file: `content/${directory}/${file}`,
      slug,
      data: parsed.data as Record<string, unknown>,
    };
  });
}

function assertExactFields(
  file: string,
  data: Record<string, unknown>,
  allowedFields: readonly string[],
  optionalFields: readonly string[] = [],
) {
  const unknown = Object.keys(data).filter((key) => !allowedFields.includes(key) && !optionalFields.includes(key));
  if (unknown.length > 0) {
    throw new Error(
      `[curation] ${file}: unknown frontmatter field${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`,
    );
  }

  const missing = allowedFields.filter((key) => !(key in data));
  if (missing.length > 0) {
    throw new Error(
      `[curation] ${file}: missing frontmatter field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    );
  }
}

function requireString(file: string, field: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(file, field, "must be a non-empty string");
  }
  return value.trim();
}

function requireBoolean(file: string, field: string, value: unknown): boolean {
  if (typeof value !== "boolean") fail(file, field, "must be a boolean");
  return value;
}

function requireOrder(file: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(file, "order", "must be a non-negative integer");
  }
  return value;
}

function requireDate(file: string, value: unknown): string {
  const date = requireString(file, "updatedAt", value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail(file, "updatedAt", "must use YYYY-MM-DD format");
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    fail(file, "updatedAt", "must be a real calendar date");
  }
  return date;
}

function requireHttpsUrl(file: string, value: unknown): string {
  const raw = requireString(file, "url", value);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail(file, "url", "must be a valid absolute URL");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    fail(file, "url", "must be a credential-free HTTPS URL");
  }
  return url.toString();
}

function requireInternalHref(file: string, value: unknown): string {
  if (value === "") return "";
  const href = requireString(file, "relatedHref", value);
  if (
    !href.startsWith("/") ||
    href.startsWith("//") ||
    href.includes("\\") ||
    /\s/.test(href)
  ) {
    fail(file, "relatedHref", "must be an internal absolute path or an empty string");
  }
  return href;
}

function requireStringList(file: string, field: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(file, field, "must be a non-empty string array");
  }
  const strings = value.map((item) => requireString(file, field, item));
  if (new Set(strings).size !== strings.length) {
    fail(file, field, "must not contain duplicates");
  }
  return strings;
}

function requireEnum<T extends string>(
  file: string,
  field: string,
  value: unknown,
  allowed: readonly T[],
): T {
  const text = requireString(file, field, value);
  if (!allowed.includes(text as T)) {
    fail(file, field, `must be one of: ${allowed.join("、")}`);
  }
  return text as T;
}

function assertUnique<T>(
  entries: T[],
  label: string,
  select: (entry: T) => string | number,
) {
  const seen = new Set<string | number>();
  for (const entry of entries) {
    const value = select(entry);
    if (seen.has(value)) {
      throw new Error(`[curation] Duplicate ${label}: ${String(value)}`);
    }
    seen.add(value);
  }
}

export function getAllTools(): ToolEntry[] {
  const iconMapPath = path.join(CONTENT_ROOT, "tool-icon-map.json");
  const iconMap: Record<string, unknown> = fs.existsSync(iconMapPath)
    ? JSON.parse(fs.readFileSync(iconMapPath, "utf8"))
    : {};
  const originalSubcategories: Record<string, string> = {
    chatgpt: "对话与搜索", codex: "开发与数据", github: "开发与数据", vercel: "网站部署",
    perplexity: "检索与研究", figma: "设计与原型", notebooklm: "检索与研究", obsidian: "笔记与资料",
  };
  const tools: ToolEntry[] = readMarkdownDirectory("tools").map(({ file, slug, data }) => {
    assertExactFields(file, data, TOOL_FIELDS, ["subcategory", "icon"]);
    const category = requireEnum(file, "category", data.category === "工程与数据" ? "开发与部署" : data.category, TOOL_CATEGORIES);
    const subcategory = requireSubcategory(file, category, data.subcategory ?? originalSubcategories[slug] ?? "");
    return {
      slug,
      name: requireString(file, "name", data.name),
      category,
      subcategory,
      icon: requireLocalIcon(file, data.icon ?? iconMap[slug] ?? ""),
      collectionSource: "",
      sourceCategories: [],
      linkStatus: "unchecked" as const,
      scenario: requireString(file, "scenario", data.scenario),
      audience: requireString(file, "audience", data.audience),
      usage: requireString(file, "usage", data.usage),
      avoidWhen: requireString(file, "avoidWhen", data.avoidWhen),
      alternatives: requireStringList(file, "alternatives", data.alternatives),
      url: requireHttpsUrl(file, data.url),
      usedByVitamin: requireBoolean(file, "usedByVitamin", data.usedByVitamin),
      featured: requireBoolean(file, "featured", data.featured),
      updatedAt: requireDate(file, data.updatedAt),
      order: requireOrder(file, data.order),
    } satisfies ToolEntry;
  });

  tools.push(...readToolCollection("tool-collection.json", 1000, iconMap));
  tools.push(...readToolCollection("tool-custom.json", 10000, iconMap));

  assertUnique(tools, "tool slug", (tool) => tool.slug);
  assertUnique(tools, "tool URL", (tool) => canonicalToolUrl(tool.url));
  assertUnique(tools, "tool order", (tool) => tool.order);
  return tools.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function requireSubcategory(file: string, category: ToolCategory, value: unknown) {
  if (!isToolSubcategory(category, value)) fail(file, "subcategory", `does not belong to ${category}`);
  return value;
}

function requireLocalIcon(file: string, value: unknown): string {
  if (value === "") return "";
  const icon = requireString(file, "icon", value);
  if (!/^\/images\/tools\/icons\/[a-z0-9-]+\.(?:png|webp|ico)$/.test(icon)) {
    fail(file, "icon", "must be a local, safely named tool icon");
  }
  if (!fs.existsSync(path.join(process.cwd(), "public", icon))) {
    fail(file, "icon", `does not exist: ${icon}`);
  }
  return icon;
}

function readToolCollection(filename: string, startOrder: number, iconMap: Record<string, unknown>): ToolEntry[] {
  const location = path.join(CONTENT_ROOT, filename);
  if (!fs.existsSync(location)) return [];
  const collection = JSON.parse(fs.readFileSync(location, "utf8"));
  if (!collection || !Array.isArray(collection.tools) || !collection.source) {
    throw new Error(`[curation] ${filename}: expected source and tools`);
  }
  const sourceName = requireString(filename, "source.name", collection.source.name);
  const updatedAt = requireDate(filename, collection.source.importedAt);
  return collection.tools.map((data: Record<string, unknown>, index: number) => {
    const file = `content/${filename}[${index}]`;
    assertExactFields(file, data, ["slug", "name", "url", "category", "subcategory", "scenario", "icon", "sourceCategories", "linkStatus"]);
    const slug = requireString(file, "slug", data.slug);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(file, "slug", "must be lowercase kebab-case");
    const category = requireEnum(file, "category", data.category, TOOL_CATEGORIES);
    if (typeof data.scenario !== "string") fail(file, "scenario", "must be a string");
    if (!Array.isArray(data.sourceCategories) || !data.sourceCategories.every(v => typeof v === "string")) {
      fail(file, "sourceCategories", "must be a string array");
    }
    return {
      slug,
      name: requireString(file, "name", data.name),
      url: validatedToolUrl(data.url),
      category,
      subcategory: requireSubcategory(file, category, data.subcategory),
      scenario: data.scenario.trim(),
      icon: requireLocalIcon(file, data.icon || iconMap[slug] || ""),
      collectionSource: sourceName,
      sourceCategories: data.sourceCategories,
      linkStatus: requireEnum(file, "linkStatus", data.linkStatus, ["ok", "restricted", "unreachable", "unchecked"] as const),
      audience: "", usage: "", avoidWhen: "", alternatives: [],
      usedByVitamin: false, featured: false,
      updatedAt, order: startOrder + index,
    } satisfies ToolEntry;
  });
}

export function getFeaturedTools(limit = 4): ToolEntry[] {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error("[curation] getFeaturedTools limit must be a non-negative integer");
  }
  return getAllTools()
    .filter((tool) => tool.usedByVitamin && tool.featured)
    .slice(0, limit);
}

export function getAllRecommendations(): RecommendationEntry[] {
  const recommendations = readMarkdownDirectory("recommendations").map(
    ({ file, slug, data }) => {
      assertExactFields(file, data, RECOMMENDATION_FIELDS);
      return {
        slug,
        title: requireString(file, "title", data.title),
        type: requireEnum(file, "type", data.type, RECOMMENDATION_TYPES),
        verdict: requireString(file, "verdict", data.verdict),
        boundary: requireString(file, "boundary", data.boundary),
        learned: requireString(file, "learned", data.learned),
        url: requireHttpsUrl(file, data.url),
        relatedHref: requireInternalHref(file, data.relatedHref),
        featured: requireBoolean(file, "featured", data.featured),
        updatedAt: requireDate(file, data.updatedAt),
        order: requireOrder(file, data.order),
      } satisfies RecommendationEntry;
    },
  );

  assertUnique(recommendations, "recommendation slug", (item) => item.slug);
  assertUnique(recommendations, "recommendation title", (item) =>
    item.title.toLocaleLowerCase(),
  );
  assertUnique(recommendations, "recommendation URL", (item) => item.url);
  assertUnique(recommendations, "recommendation order", (item) => item.order);
  return recommendations.sort(
    (a, b) => a.order - b.order || a.title.localeCompare(b.title),
  );
}
