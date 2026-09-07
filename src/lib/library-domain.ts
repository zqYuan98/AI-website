import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { toPublicResource } from "./public-resources";
import { RESOURCE_CATEGORIES, RESOURCE_KINDS, type LibraryResource, type LibraryState, type PublicLibrarySnapshot, type PublishPreview } from "./resource-types";
import { bookmarkUrl, canonicalBookmarkUrl, MAX_IMPORT_ITEMS, parseBookmarkHtml, validateImportCandidate } from "./bookmark-import";
import { validatedToolUrl } from "./tool-url";

export class LibraryInputError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = "LibraryInputError"; }
}

export const MAX_RESOURCES = 20000;
export const MAX_STORE_BYTES = 32 * 1024 * 1024;

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LibraryInputError("请求格式不正确。");
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number, label: string, required = false): string {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new LibraryInputError(`${label}${required ? "不能为空，且" : ""}不能超过 ${max} 个字符。`);
  return value.trim();
}

function strings(value: unknown, maxCount: number, maxLength: number, label: string): string[] {
  if (!Array.isArray(value) || value.length > maxCount) throw new LibraryInputError(`${label}数量超过限制。`);
  return [...new Set(value.map(item => text(item, maxLength, label)).filter(Boolean))];
}

function option<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== "string" || !options.includes(value as T)) throw new LibraryInputError(`请选择有效的${label}。`);
  return value as T;
}

function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new LibraryInputError("开关值格式不正确。");
  return value;
}

function newResource(input: Record<string, unknown>, now: string): LibraryResource {
  let url: string;
  try { url = bookmarkUrl(input.url); } catch (error) { throw new LibraryInputError((error as Error).message); }
  return {
    id: `saved-${randomUUID()}`, name: text(input.name, 120, "名称", true), url, icon: "", kind: "website", category: "效率与生活",
    subcategory: "", tags: [], description: "", recommendation: "", audience: "", usage: "", boundary: "", alternatives: [], featured: false, usedByVitamin: false,
    relatedHref: "", updatedAt: now, visibility: "private", status: "inbox", pinned: false, notes: "", source: "手动收藏", sourceFolder: "", createdAt: now, importBatchId: "",
  };
}

function eligible(resource: LibraryResource): boolean { return resource.visibility === "public" && resource.status === "organized"; }

function sanitizeSave(input: Record<string, unknown>, existing?: LibraryResource): LibraryResource {
  const now = new Date().toISOString();
  const resource = existing ? { ...existing } : newResource(input, now);
  const fields = { name: 120, subcategory: 100, description: 1000, recommendation: 2000, audience: 1000, usage: 2000, boundary: 2000, notes: 10000 } as const;
  for (const field of Object.keys(fields) as (keyof typeof fields)[]) {
    if (input[field] !== undefined) resource[field] = text(input[field], fields[field], field === "name" ? "名称" : "内容", field === "name");
  }
  if (input.url !== undefined) {
    try { resource.url = bookmarkUrl(input.url); } catch (error) { throw new LibraryInputError((error as Error).message); }
  }
  if (input.kind !== undefined) resource.kind = option(input.kind, RESOURCE_KINDS, "类型");
  if (input.category !== undefined) resource.category = option(input.category, RESOURCE_CATEGORIES, "分类");
  if (input.tags !== undefined) resource.tags = strings(input.tags, 20, 40, "标签");
  if (input.alternatives !== undefined) resource.alternatives = strings(input.alternatives, 12, 120, "替代资源");
  if (input.pinned !== undefined) resource.pinned = bool(input.pinned);
  if (existing && input.visibility !== undefined) resource.visibility = option(input.visibility, ["private", "public"], "可见性");
  if (existing && input.status !== undefined) resource.status = option(input.status, ["inbox", "organized", "archived"], "状态");
  if (resource.status === "archived") resource.visibility = "private";
  if (resource.visibility === "public" && resource.status !== "organized") throw new LibraryInputError("请先将资源设为已整理，再设为公开。");
  if (resource.visibility === "public") {
    try { validatedToolUrl(resource.url); }
    catch { throw new LibraryInputError("本机或内网地址可以私人收藏，公开资源需使用公开网站域名。"); }
  }
  const featured = input.featured === undefined ? resource.featured : bool(input.featured);
  if (input.featured === true && (!eligible(resource) || !resource.recommendation.trim())) throw new LibraryInputError("精选资源需已整理、设为公开，并填写真实推荐理由。");
  resource.featured = featured && eligible(resource) && Boolean(resource.recommendation.trim());
  // Provenance, local icons, timestamps, and personal-use claims cannot be set by a submitted object.
  resource.updatedAt = now;
  return resource;
}

export function publicationPreview(state: LibraryState, snapshot: PublicLibrarySnapshot): PublishPreview {
  const resources = state.resources.filter(eligible).map(toPublicResource);
  const previous = snapshot.resources;
  const before = new Map(previous.map(resource => [resource.id, resource]));
  const after = new Map(resources.map(resource => [resource.id, resource]));
  const revision = createHash("sha256").update(JSON.stringify({ state, previous, publishedAt: snapshot.publishedAt })).digest("hex");
  return {
    resources, added: resources.filter(resource => !before.has(resource.id)).map(resource => resource.id),
    removed: previous.filter(resource => !after.has(resource.id)).map(resource => resource.id),
    changed: resources.filter(resource => before.has(resource.id) && JSON.stringify(before.get(resource.id)) !== JSON.stringify(resource)).map(resource => resource.id), revision,
  };
}

function validateIds(value: unknown): string[] {
  const ids = strings(value, MAX_IMPORT_ITEMS, 180, "资源 ID");
  if (!ids.length) throw new LibraryInputError("请先选择资源。");
  return ids;
}


export const LIBRARY_MUTATIONS = new Set(["save", "bulk", "import", "undo-import", "publish"]);
export function libraryObject(value: unknown): Record<string, unknown> { return object(value); }

function date(value: unknown, label: string): string {
  const result = text(value, 40, label);
  if (result && !Number.isFinite(Date.parse(result))) throw new LibraryInputError(`${label}格式不正确。`);
  return result;
}

/** Validate untrusted DB/backup input and discard unknown properties at both visibility boundaries. */
export function normalizePublicSnapshot(value: unknown): PublicLibrarySnapshot {
  const input = object(value);
  if (input.version !== 1 || !Array.isArray(input.resources) || input.resources.length > MAX_RESOURCES || Buffer.byteLength(JSON.stringify(input)) > MAX_STORE_BYTES) throw new LibraryInputError("公开快照格式不正确或超过 32 MB。");
  const resources = input.resources.map(item => toPublicResource(object(item) as unknown as LibraryResource));
  if (new Set(resources.map(item => item.id)).size !== resources.length) throw new LibraryInputError("公开快照包含重复 ID。");
  return { version: 1, publishedAt: date(input.publishedAt, "发布时间"), resources };
}

export function normalizeLibraryState(value: unknown): LibraryState {
  const input = object(value);
  if (input.version !== 1 || !Array.isArray(input.resources) || input.resources.length > MAX_RESOURCES || Buffer.byteLength(JSON.stringify(input)) > MAX_STORE_BYTES) throw new LibraryInputError("私人备份格式不正确或超过 32 MB。");
  const resources = input.resources.map(raw => {
    const item = object(raw);
    const visibility = option(item.visibility, ["private", "public"], "可见性");
    const status = option(item.status, ["inbox", "organized", "archived"], "状态");
    if (visibility === "public" && status !== "organized") throw new LibraryInputError("备份中的公开资源必须为已整理状态。");
    let url: string;
    try { url = bookmarkUrl(item.url); } catch { throw new LibraryInputError("备份中存在无效网址。"); }
    // Validate the common presentation fields separately from private URLs, which may be intranet addresses.
    const presentation = toPublicResource({ ...item, url: visibility === "public" ? url : "https://example.com" } as unknown as LibraryResource);
    const resource: LibraryResource = {
      ...presentation, url, visibility, status, pinned: bool(item.pinned), notes: text(item.notes, 10000, "私人备注"),
      source: text(item.source, 120, "来源"), sourceFolder: text(item.sourceFolder, 1000, "原文件夹"),
      createdAt: date(item.createdAt, "收藏时间"), importBatchId: text(item.importBatchId, 180, "导入批次"),
    };
    if (item.importedAt !== undefined) resource.importedAt = date(item.importedAt, "导入时间");
    if (resource.featured && !eligible(resource)) throw new LibraryInputError("备份中的精选资源必须为已整理且公开。");
    return resource;
  });
  if (new Set(resources.map(item => item.id)).size !== resources.length) throw new LibraryInputError("私人备份包含重复 ID。");
  return { version: 1, publishedAt: date(input.publishedAt, "发布时间"), resources };
}

export function libraryFromPublished(snapshot: PublicLibrarySnapshot): LibraryState {
  const current = normalizePublicSnapshot(snapshot);
  return { version: 1, publishedAt: current.publishedAt, resources: current.resources.map(resource => ({
    ...resource, visibility: "public", status: "organized", pinned: false, notes: "", source: "既有公开资源", sourceFolder: "", createdAt: "", importBatchId: "",
  })) };
}

/** A restore replaces the private working copy only; the current public snapshot remains authoritative. */
export function restoredLibrary(backup: unknown, current: PublicLibrarySnapshot): LibraryState {
  const state = normalizeLibraryState(backup);
  state.publishedAt = current.publishedAt;
  const published = new Set(current.resources.map(resource => resource.id));
  for (const resource of state.resources) if (published.has(resource.id)) resource.importBatchId = "";
  return state;
}

/** Pure domain transition. Adapters decide how the draft and optional publication commit atomically. */
export function applyLibraryAction(original: LibraryState, value: unknown, current: PublicLibrarySnapshot) {
  const input = object(value);
  const state = structuredClone(original);
  let publishedSnapshot: PublicLibrarySnapshot | undefined;
  const run = (): Record<string, unknown> => {
    if (input.action === "list") return { resources: state.resources, publishedAt: current.publishedAt };
    if (input.action === "backup") return { data: state };
    if (input.action === "import-preview") {
      try { return parseBookmarkHtml(input.html, state.resources.map(resource => resource.url)); }
      catch (error) { throw new LibraryInputError((error as Error).message); }
    }
    if (input.action === "publish-preview") return publicationPreview(state, current);
    if (input.action === "publish") {
      const next = publicationPreview(state, current);
      if (typeof input.revision !== "string" || input.revision !== next.revision) throw new LibraryInputError("资源或公开快照已变化，请重新预览后再发布。", 409);
      const publishedAt = new Date().toISOString();
      const snapshot: PublicLibrarySnapshot = { version: 1, publishedAt, resources: next.resources };
      publishedSnapshot = snapshot;
      state.publishedAt = publishedAt;
      // Keep a published batch safe from later undo, including after it is made private again.
      for (const resource of state.resources) if (eligible(resource)) resource.importBatchId = "";

      return { publishedAt, count: next.resources.length };
    }
    if (input.action === "save") {
      const submitted = object(input.resource);
      const existing = submitted.id === undefined ? undefined : state.resources.find(resource => resource.id === submitted.id);
      if (submitted.id !== undefined && !existing) throw new LibraryInputError("资源已不存在，请刷新列表。", 404);
      const resource = sanitizeSave(submitted, existing);
      if (state.resources.some(item => item.id !== resource.id && canonicalBookmarkUrl(item.url) === canonicalBookmarkUrl(resource.url))) throw new LibraryInputError("这个网址已在资源库中。", 409);
      if (existing) state.resources[state.resources.findIndex(item => item.id === existing.id)] = resource;
      else {
        if (state.resources.length >= MAX_RESOURCES) throw new LibraryInputError("资源库已达到 20000 条上限。");
        state.resources.unshift(resource);
      }

      return { resources: state.resources };
    }
    if (input.action === "bulk") {
      const ids = new Set(validateIds(input.ids));
      const changes = object(input.changes);
      if (!Object.keys(changes).length || Object.keys(changes).some(key => !["category", "status", "pinned", "visibility"].includes(key))) throw new LibraryInputError("批量操作仅支持分类、状态、置顶和可见性。");
      if ([...ids].some(id => !state.resources.some(resource => resource.id === id))) throw new LibraryInputError("部分资源已不存在，请刷新列表。", 404);
      state.resources = state.resources.map(resource => ids.has(resource.id) ? sanitizeSave(changes, resource) : resource);

      return { resources: state.resources };
    }
    if (input.action === "import") {
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > MAX_IMPORT_ITEMS) throw new LibraryInputError("请选择 1–5000 条书签导入。");
      const seen = new Set(state.resources.map(resource => canonicalBookmarkUrl(resource.url)));
      const now = new Date().toISOString();
      const batchId = randomUUID();
      const additions: LibraryResource[] = [];
      let skipped = 0;
      for (const raw of input.items) {
        let item;
        try { item = validateImportCandidate(raw); } catch (error) { throw new LibraryInputError((error as Error).message); }
        const key = canonicalBookmarkUrl(item.url);
        if (seen.has(key)) { skipped++; continue; }
        seen.add(key);
        additions.push({ ...newResource(item, now), source: "浏览器书签", sourceFolder: item.sourceFolder, createdAt: item.createdAt, importedAt: now, importBatchId: batchId });
      }
      if (state.resources.length + additions.length > MAX_RESOURCES) throw new LibraryInputError("导入后将超过资源库 20000 条上限。");
      state.resources.unshift(...additions);

      return { resources: state.resources, added: additions.length, skipped, batchId: additions.length ? batchId : "" };
    }
    if (input.action === "undo-import") {
      const batchId = text(input.batchId, 180, "导入批次", true);
      const published = new Set(current.resources.map(resource => resource.id));
      const before = state.resources.length;
      state.resources = state.resources.filter(resource => resource.importBatchId !== batchId || resource.visibility !== "private" || published.has(resource.id));

      return { resources: state.resources, removed: before - state.resources.length };
    }
    throw new LibraryInputError("不支持此操作。");
  };
  const result = run();
  if (Buffer.byteLength(JSON.stringify(state)) > MAX_STORE_BYTES) throw new LibraryInputError("资源库已超过 32 MB，请先备份并整理内容。");
  return { state, result, changed: LIBRARY_MUTATIONS.has(String(input.action)), publishedSnapshot };
}
