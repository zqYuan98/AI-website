import "server-only";

import fs from "node:fs";
import path from "node:path";
import { getAllRecommendations, getAllTools, type ToolCategory } from "./curation";
import { RESOURCE_CATEGORIES, RESOURCE_KINDS, type PublicResource, type ResourceCategory } from "./resource-types";
import { validatedToolUrl } from "./tool-url";

const CATEGORY_MAP: Record<ToolCategory, ResourceCategory> = {
  "AI 工作流": "AI 与自动化", "产品与研究": "学习与研究", "设计与原型": "设计与创作",
  "开发与部署": "开发与技术", "写作与知识管理": "写作与知识", "效率与系统": "效率与生活",
};
const COMMUNITY_HOSTS = new Set(["nodeseek.com", "linux.do", "nodeloc.com"]);

function field(input: PublicResource, name: keyof PublicResource, max = 2000): string {
  const value = input[name];
  if (typeof value !== "string" || value.length > max) throw new Error(`[resources] Invalid ${name}`);
  return value.trim();
}

function list(input: PublicResource, name: "tags" | "alternatives"): string[] {
  const value = input[name];
  if (!Array.isArray(value) || value.length > 30 || value.some(item => typeof item !== "string" || item.length > 120)) {
    throw new Error(`[resources] Invalid ${name}`);
  }
  return [...new Set(value.map(item => item.trim()).filter(Boolean))];
}

/** Explicit publication boundary: never spread a private resource into a public payload. */
export function toPublicResource(input: PublicResource): PublicResource {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("[resources] Invalid entry");
  const id = field(input, "id", 120);
  const name = field(input, "name", 120);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || !name) throw new Error("[resources] Invalid identity");
  if (!RESOURCE_CATEGORIES.includes(input.category) || !RESOURCE_KINDS.includes(input.kind)) throw new Error("[resources] Invalid classification");
  const icon = field(input, "icon", 240);
  if (icon && !/^\/images\/tools\/icons\/[a-z0-9-]+\.(png|webp|ico)$/.test(icon)) throw new Error("[resources] Invalid icon");
  const relatedHref = field(input, "relatedHref", 240);
  if (relatedHref && (!relatedHref.startsWith("/") || relatedHref.startsWith("//") || /[\\\s]/.test(relatedHref))) throw new Error("[resources] Invalid related link");
  if (typeof input.featured !== "boolean" || typeof input.usedByVitamin !== "boolean") throw new Error("[resources] Invalid curation flags");
  const updatedAt = field(input, "updatedAt", 40);
  if (updatedAt && Number.isNaN(Date.parse(updatedAt))) throw new Error("[resources] Invalid date");
  const recommendation = field(input, "recommendation");
  if (input.featured && !recommendation) throw new Error("[resources] Featured resources need a recommendation");
  return {
    id, name, url: validatedToolUrl(input.url), icon, kind: input.kind, category: input.category,
    subcategory: field(input, "subcategory", 120), tags: list(input, "tags"),
    description: field(input, "description"), recommendation,
    audience: field(input, "audience"), usage: field(input, "usage"), boundary: field(input, "boundary"),
    alternatives: list(input, "alternatives"), featured: input.featured, usedByVitamin: input.usedByVitamin,
    relatedHref, updatedAt,
  };
}

/** Legacy data is already public; preserve it until the owner creates a publication. */
export function getLegacyPublicResources(): PublicResource[] {
  const tools = getAllTools().map(tool => {
    const host = new URL(tool.url).hostname.replace(/^www\./, "");
    const community = COMMUNITY_HOSTS.has(host);
    let category = CATEGORY_MAP[tool.category];
    if (community) category = "开发与技术";
    if (host === "amon.org" || host === "mail.google.com") category = "效率与生活";
    return toPublicResource({
      id: tool.slug, name: tool.name, url: tool.url, icon: tool.icon,
      kind: community || host === "amon.org" ? "website" : tool.subcategory === "图标与素材" ? "asset" : "tool",
      category, subcategory: tool.subcategory, tags: [], description: tool.scenario,
      // Imported descriptions describe purpose, not a personal recommendation.
      recommendation: tool.collectionSource ? "" : tool.usage,
      audience: tool.audience, usage: tool.usage, boundary: tool.avoidWhen,
      alternatives: tool.alternatives, featured: tool.featured, usedByVitamin: tool.usedByVitamin,
      relatedHref: "", updatedAt: tool.updatedAt,
    });
  });
  const reading = getAllRecommendations().map(item => toPublicResource({
    id: `reading-${item.slug}`, name: item.title, url: item.url, icon: "", kind: "article",
    category: "学习与研究", subcategory: item.type, tags: [item.type], description: item.verdict,
    recommendation: item.learned, audience: "", usage: "", boundary: item.boundary, alternatives: [],
    featured: item.featured, usedByVitamin: false, relatedHref: item.relatedHref, updatedAt: item.updatedAt,
  }));
  return [...tools, ...reading];
}

/** This module must remain independent of private-library and the owner's storage. */
export function getPublicResources(): PublicResource[] {
  const file = path.join(process.cwd(), "content", "resource-library.json");
  if (!fs.existsSync(file)) return getLegacyPublicResources();
  const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!snapshot || snapshot.version !== 1 || typeof snapshot.publishedAt !== "string" || !Array.isArray(snapshot.resources)) {
    throw new Error("[resources] Invalid public snapshot");
  }
  const resources: PublicResource[] = snapshot.resources.map(toPublicResource);
  const ids = new Set(resources.map(resource => resource.id));
  if (ids.size !== resources.length) throw new Error("[resources] Duplicate public resource ID");
  return resources;
}

export function getFeaturedPublicResources(limit = 4): PublicResource[] {
  return getPublicResources().filter(item => item.featured && item.usedByVitamin && item.kind === "tool").slice(0, limit);
}
