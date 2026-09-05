import fs from "node:fs";
import path from "node:path";
import {
  assertUniqueSlugs,
  contentError,
  contentTags,
  isContentSlug,
  optionalContentCover,
  parseFrontmatter,
  requireContentBoolean,
  requireContentDate,
  requireContentOrder,
  requireContentSlug,
  requireContentString,
} from "./content-validation";
import { estimateReadingTime } from "./reading-time";

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
  return fs.readFileSync(path.join(CONTENT_ROOT, dir, file), "utf8");
}

function toSlug(file: string) {
  return file.replace(/\.mdx?$/, "");
}

function fileForSlug(directory: string, slug: string): string | undefined {
  if (!isContentSlug(slug)) return undefined;
  const files = [slug + ".md", slug + ".mdx"].filter((file) =>
    fs.existsSync(path.join(CONTENT_ROOT, directory, file)),
  );
  if (files.length > 1) contentError(`content/${directory}`, "slug", `不能重复：${slug}`);
  return files[0];
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

export function parseWorkContent(file: string, raw: string): WorkPost {
  const source = `content/work/${file}`;
  const { data, body } = parseFrontmatter(source, raw);
  const sections = splitSections(body);
  return {
    slug: requireContentSlug(source, toSlug(file)),
    title: requireContentString(source, "title", data.title),
    summary: requireContentString(source, "summary", data.summary),
    role: requireContentString(source, "role", data.role),
    period: requireContentString(source, "period", data.period),
    tags: contentTags(source, data.tags),
    accent: data.accent === undefined ? "blue" : requireContentString(source, "accent", data.accent),
    placeholder: requireContentBoolean(source, "placeholder", data.placeholder),
    order: requireContentOrder(source, data.order),
    featured: requireContentBoolean(source, "featured", data.featured),
    cover: optionalContentCover(source, data.cover),
    background: requireContentString(source, "背景 / 问题", pickSection(sections, ["背景/问题", "背景 / 问题", "背景"])),
    actions: requireContentString(source, "我做了什么", pickSection(sections, ["我做了什么", "过程"])),
    outcome: requireContentString(source, "结果与反思", pickSection(sections, ["结果与反思", "结果", "反思"])),
    body,
  };
}

export function getAllWork(): WorkPost[] {
  const items = readDir("work").map((file) => parseWorkContent(file, readFile("work", file)));
  assertUniqueSlugs("content/work", items);
  return items.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function getWorkSlugs(): string[] {
  return getAllWork().map((item) => item.slug);
}

export function getWorkBySlug(slug: string): WorkPost | undefined {
  const file = fileForSlug("work", slug);
  return file ? parseWorkContent(file, readFile("work", file)) : undefined;
}

export function getFeaturedWork(limit = 3): WorkPost[] {
  const all = getAllWork();
  const featured = all.filter((item) => item.featured);
  return (featured.length > 0 ? featured : all).slice(0, limit);
}

export function parseBlogContent(file: string, raw: string): BlogPost {
  const source = `content/blog/${file}`;
  const { data, body } = parseFrontmatter(source, raw);
  return {
    slug: requireContentSlug(source, toSlug(file)),
    title: requireContentString(source, "title", data.title),
    summary: requireContentString(source, "summary", data.summary),
    date: requireContentDate(source, "date", data.date),
    readingTime: estimateReadingTime(body),
    tags: contentTags(source, data.tags),
    placeholder: requireContentBoolean(source, "placeholder", data.placeholder),
    cover: optionalContentCover(source, data.cover),
    body,
  };
}

export function getAllPosts(): BlogPost[] {
  const items = readDir("blog").map((file) => parseBlogContent(file, readFile("blog", file)));
  assertUniqueSlugs("content/blog", items);
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getPostSlugs(): string[] {
  return getAllPosts().map((item) => item.slug);
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  const file = fileForSlug("blog", slug);
  return file ? parseBlogContent(file, readFile("blog", file)) : undefined;
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  // Calendar dates must not shift by a day with the server's timezone.
  const [year, month, day] = date.split("-").map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
}
