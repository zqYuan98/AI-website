import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const CONTENT_ROOT = path.join(process.cwd(), "content");

export type WorkSection = {
  heading: string;
  body: string;
};

export type WorkMeta = {
  slug: string;
  title: string;
  summary: string;
  role: string;
  period: string;
  tags: string[];
  accent: string;
  placeholder: boolean;
  order: number;
  featured: boolean;
  cover?: string;
};

export type WorkPost = WorkMeta & {
  background: string;
  actions: string;
  outcome: string;
  body: string;
};

export type PostMeta = {
  slug: string;
  title: string;
  summary: string;
  date: string;
  readingTime: string;
  tags: string[];
  placeholder: boolean;
  cover?: string;
};

export type BlogPost = PostMeta & {
  body: string;
};

function readDir(dir: string): string[] {
  const target = path.join(CONTENT_ROOT, dir);
  if (!fs.existsSync(target)) return [];
  return fs
    .readdirSync(target)
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"));
}

function readFile(dir: string, file: string) {
  const raw = fs.readFileSync(path.join(CONTENT_ROOT, dir, file), "utf8");
  return matter(raw);
}

function toSlug(file: string) {
  return file.replace(/\.mdx?$/, "");
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

function asTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((tag): tag is string => typeof tag === "string");
  }
  return [];
}

/**
 * 从 markdown 正文中按二级标题切出章节。
 * 例如 `## 背景 / 问题` 之后的内容会成为该章节的正文。
 */
function splitSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = body.split("\n");
  let current: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (current) {
      sections[current] = buffer.join("\n").trim();
    }
    buffer = [];
  };

  for (const line of lines) {
    const match = /^##\s+(.*)$/.exec(line.trim());
    if (match) {
      flush();
      current = match[1].trim();
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();
  return sections;
}

function pickSection(sections: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const found = Object.keys(sections).find((heading) =>
      heading.replace(/\s+/g, "").includes(key.replace(/\s+/g, "")),
    );
    if (found && sections[found]) return sections[found];
  }
  return "";
}

export function getAllWork(): WorkPost[] {
  const items = readDir("work").map((file) => {
    const { data, content } = readFile("work", file);
    const sections = splitSections(content);
    return {
      slug: toSlug(file),
      title: asString(data.title, toSlug(file)),
      summary: asString(data.summary),
      role: asString(data.role, "产品练习"),
      period: asString(data.period),
      tags: asTags(data.tags),
      accent: asString(data.accent, "blue"),
      placeholder: asBoolean(data.placeholder, true),
      order: asNumber(data.order, 99),
      featured: asBoolean(data.featured, false),
      cover: asString(data.cover) || undefined,
      background: pickSection(sections, ["背景/问题", "背景 / 问题", "背景"]),
      actions: pickSection(sections, ["我做了什么", "过程"]),
      outcome: pickSection(sections, ["结果与反思", "结果", "反思"]),
      body: content.trim(),
    } satisfies WorkPost;
  });

  return items.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function getWorkSlugs(): string[] {
  return getAllWork().map((item) => item.slug);
}

export function getWorkBySlug(slug: string): WorkPost | undefined {
  return getAllWork().find((item) => item.slug === slug);
}

export function getFeaturedWork(limit = 3): WorkPost[] {
  const all = getAllWork();
  const featured = all.filter((item) => item.featured);
  return (featured.length > 0 ? featured : all).slice(0, limit);
}

export function getAllPosts(): BlogPost[] {
  const items = readDir("blog").map((file) => {
    const { data, content } = readFile("blog", file);
    return {
      slug: toSlug(file),
      title: asString(data.title, toSlug(file)),
      summary: asString(data.summary),
      date: asString(data.date),
      readingTime: asString(data.readingTime, ""),
      tags: asTags(data.tags),
      placeholder: asBoolean(data.placeholder, true),
      cover: asString(data.cover) || undefined,
      body: content.trim(),
    } satisfies BlogPost;
  });

  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getPostSlugs(): string[] {
  return getAllPosts().map((item) => item.slug);
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return getAllPosts().find((item) => item.slug === slug);
}

export function getLatestPosts(limit = 3): BlogPost[] {
  return getAllPosts().slice(0, limit);
}

export function getAllTags(): string[] {
  const tags = new Set<string>();
  for (const post of getAllPosts()) {
    for (const tag of post.tags) tags.add(tag);
  }
  return [...tags];
}

export function formatDate(date: string): string {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return `${parsed.getFullYear()} 年 ${parsed.getMonth() + 1} 月 ${parsed.getDate()} 日`;
}
