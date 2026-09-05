import "server-only";

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export function contentError(source: string, field: string, reason: string): never {
  throw new Error(`[${source}] 字段“${field}”${reason}`);
}

export function parseFrontmatter(source: string, raw: string) {
  const input = raw.replace(/^\uFEFF/, "");
  // These files are YAML content, not executable gray-matter engines.
  if (!/^---\r?\n/.test(input)) {
    contentError(source, "frontmatter", "必须以独立一行 --- 开始，使用 YAML 格式");
  }
  const parsed = matter(input);
  if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
    contentError(source, "frontmatter", "必须是字段对象");
  }
  return {
    data: parsed.data as Record<string, unknown>,
    body: requireContentString(source, "正文", parsed.content),
  };
}

export function requireContentString(source: string, field: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    contentError(source, field, "必须是非空字符串");
  }
  return value.trim();
}

export function requireContentBoolean(source: string, field: string, value: unknown): boolean {
  if (typeof value !== "boolean") contentError(source, field, "必须是布尔值");
  return value;
}

export function requireContentOrder(source: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    contentError(source, "order", "必须是非负整数");
  }
  return value;
}

export function requireContentDate(source: string, field: string, value: unknown): string {
  // Quoted strings prevent YAML's implicit timestamp parser from normalizing
  // impossible dates (e.g. February 31) before we can validate the original day.
  if (typeof value !== "string") {
    contentError(source, field, '必须是 YYYY-MM-DD 字符串，请为 YAML 日期加引号，如 "2026-09-05"');
  }
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    contentError(source, field, "必须使用 YYYY-MM-DD 格式");
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    contentError(source, field, "必须是真实存在的日历日期");
  }
  return date;
}

export function isContentSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function requireContentSlug(source: string, value: string): string {
  if (!isContentSlug(value)) contentError(source, "slug", "只能使用小写英文、数字和单个连字符");
  return value;
}

export function contentTags(source: string, value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) contentError(source, "tags", "必须是字符串数组");
  const tags = value.map((tag) => requireContentString(source, "tags", tag));
  if (new Set(tags).size !== tags.length) contentError(source, "tags", "不能重复");
  return tags;
}

export function requireContentCover(source: string, value: unknown): string {
  const cover = requireContentString(source, "cover", value);
  if (!cover.startsWith("/") || cover.startsWith("//") || /[\\?#%]/.test(cover) ||
      cover.split("/").some((part) => part === "." || part === "..")) {
    contentError(source, "cover", "必须是 public 内不含查询参数或路径跳转的站内绝对路径");
  }
  const publicRoot = path.resolve(process.cwd(), "public");
  const filename = path.resolve(publicRoot, `.${cover}`);
  const relative = path.relative(publicRoot, filename);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    contentError(source, "cover", "必须指向 public 内的文件");
  }
  if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
    contentError(source, "cover", `文件不存在：${cover}`);
  }
  return cover;
}

export function optionalContentCover(source: string, value: unknown): string | undefined {
  return value === undefined ? undefined : requireContentCover(source, value);
}

export function assertUniqueSlugs(source: string, items: readonly { slug: string }[]): void {
  const slugs = new Set<string>();
  for (const item of items) {
    if (slugs.has(item.slug)) contentError(source, "slug", `不能重复：${item.slug}`);
    slugs.add(item.slug);
  }
}
