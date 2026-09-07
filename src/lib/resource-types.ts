/** Shared display contracts. No private storage or filesystem imports belong here. */
export const RESOURCE_CATEGORIES = ["AI 与自动化", "学习与研究", "设计与创作", "开发与技术", "写作与知识", "效率与生活"] as const;
export const RESOURCE_KINDS = ["tool", "website", "article", "asset"] as const;
export const RESOURCE_KIND_LABELS = { tool: "工具", website: "网站", article: "文章", asset: "素材" } as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type PublicResource = {
  id: string;
  name: string;
  url: string;
  icon: string;
  kind: ResourceKind;
  category: ResourceCategory;
  subcategory: string;
  tags: string[];
  description: string;
  recommendation: string;
  audience: string;
  usage: string;
  boundary: string;
  alternatives: string[];
  featured: boolean;
  usedByVitamin: boolean;
  relatedHref: string;
  updatedAt: string;
};
export type LibraryResource = PublicResource & {
  visibility: "private" | "public";
  status: "inbox" | "organized" | "archived";
  pinned: boolean;
  notes: string;
  source: string;
  sourceFolder: string;
  createdAt: string;
  importedAt?: string;
  importBatchId: string;
};
export type ImportCandidate = { name: string; url: string; sourceFolder: string; createdAt: string };
export type PublicLibrarySnapshot = { version: 1; publishedAt: string; resources: PublicResource[] };
export type LibraryState = { version: 1; resources: LibraryResource[]; publishedAt: string };
export type PublishPreview = {
  resources: PublicResource[];
  added: string[];
  removed: string[];
  changed: string[];
  revision: string;
};
