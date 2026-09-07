import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { getPublicResources, toPublicResource } from "./public-resources";
import { RESOURCE_CATEGORIES, RESOURCE_KINDS, type LibraryResource, type LibraryState, type PublicLibrarySnapshot, type PublicResource, type PublishPreview } from "./resource-types";
import { bookmarkUrl, canonicalBookmarkUrl, MAX_IMPORT_ITEMS, parseBookmarkHtml, validateImportCandidate } from "./bookmark-import";
import { validatedToolUrl } from "./tool-url";

export class LibraryInputError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = "LibraryInputError"; }
}

const MAX_RESOURCES = 20000;
const MAX_STORE_BYTES = 32 * 1024 * 1024;
let queue: Promise<unknown> = Promise.resolve();

function object(value: unknown): Record<string, unknown> {
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

function realDestination(destination: string): string {
  let ancestor = path.resolve(destination);
  const tail: string[] = [];
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new LibraryInputError("私人资源库目录不可用。");
    tail.unshift(path.basename(ancestor));
    ancestor = parent;
  }
  return path.join(fs.realpathSync(ancestor), ...tail);
}

function inside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function storageFile(): string {
  if (process.env.NODE_ENV !== "development") throw new LibraryInputError("此功能仅在本机开发模式可用。", 404);
  const workspace = fs.realpathSync(process.cwd());
  const projectKey = createHash("sha256").update(workspace).digest("hex").slice(0, 16);
  const requested = process.env.VITAMIN_LIBRARY_DIR || path.join(os.homedir(), ".vitamin-library", projectKey);
  const directory = realDestination(requested);
  if (inside(workspace, directory)) throw new LibraryInputError("私人资源库必须存放在项目目录之外。");
  const filename = path.join(directory, "library.json");
  if (fs.existsSync(filename) && inside(workspace, realDestination(filename))) throw new LibraryInputError("私人资源库必须存放在项目目录之外。");
  return filename;
}

function atomicJson(filename: string, data: unknown) {
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > MAX_STORE_BYTES) throw new LibraryInputError("资源库已超过 32 MB，请先备份并整理内容。");
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, serialized);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, filename);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function publicFilename(): string { return path.join(process.cwd(), "content", "resource-library.json"); }

function currentPublishedAt(): string {
  const filename = publicFilename();
  if (!fs.existsSync(filename)) return "";
  const snapshot = JSON.parse(fs.readFileSync(filename, "utf8")) as PublicLibrarySnapshot;
  return typeof snapshot.publishedAt === "string" ? snapshot.publishedAt : "";
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

function readState(filename: string): LibraryState {
  if (!fs.existsSync(filename)) {
    const state: LibraryState = { version: 1, publishedAt: currentPublishedAt(), resources: getPublicResources().map(resource => ({
      ...toPublicResource(resource), visibility: "public", status: "organized", pinned: false, notes: "", source: "既有公开资源", sourceFolder: "", createdAt: "", importBatchId: "",
    })) };
    atomicJson(filename, state);
    return state;
  }
  if (fs.statSync(filename).size > MAX_STORE_BYTES) throw new LibraryInputError("私人资源库文件过大，请从本地备份恢复。");
  const state = JSON.parse(fs.readFileSync(filename, "utf8")) as LibraryState;
  if (state.version !== 1 || !Array.isArray(state.resources) || state.resources.length > MAX_RESOURCES || typeof state.publishedAt !== "string") throw new LibraryInputError("私人资源库格式不正确，请从本地备份恢复。");
  const ids = new Set<string>();
  for (const resource of state.resources) {
    if (!resource || typeof resource.id !== "string" || ids.has(resource.id) || typeof resource.url !== "string" || !["private", "public"].includes(resource.visibility) || !["inbox", "organized", "archived"].includes(resource.status)) throw new LibraryInputError("私人资源库格式不正确，请从本地备份恢复。");
    ids.add(resource.id);
  }
  return state;
}

function preview(state: LibraryState): PublishPreview {
  const resources = state.resources.filter(eligible).map(toPublicResource);
  const previous = getPublicResources();
  const before = new Map(previous.map(resource => [resource.id, resource]));
  const after = new Map(resources.map(resource => [resource.id, resource]));
  const revision = createHash("sha256").update(JSON.stringify({ state, previous, publishedAt: currentPublishedAt() })).digest("hex");
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

async function underLock<T>(filename: string, work: () => T): Promise<T> {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const lock = `${filename}.lock`;
  let descriptor: number | undefined;
  const until = Date.now() + 5000;
  for (;;) {
    try {
      descriptor = fs.openSync(lock, "wx", 0o600);
      try { fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token: randomUUID() })); }
      catch (error) { fs.closeSync(descriptor); descriptor = undefined; fs.unlinkSync(lock); throw error; }
      break;
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // Recover only a lock whose owning process is demonstrably gone. Never expire a live lock.
      try {
        const observed = fs.readFileSync(lock, "utf8");
        const owner = JSON.parse(observed) as { pid?: unknown };
        if (typeof owner.pid === "number" && Number.isSafeInteger(owner.pid) && owner.pid > 0) {
          try { process.kill(owner.pid, 0); }
          catch (signalError) {
            if ((signalError as NodeJS.ErrnoException).code === "ESRCH" && fs.readFileSync(lock, "utf8") === observed) {
              fs.unlinkSync(lock);
              continue;
            }
          }
        }
      } catch { /* Missing, incomplete, or unreadable locks require a retry, never an unsafe deletion. */ }
      if (Date.now() >= until) throw new LibraryInputError("资源库正被另一个本机操作使用，请稍后重试。", 409);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try { return work(); }
  finally { fs.closeSync(descriptor); fs.unlinkSync(lock); }
}

/** All local reads and mutations share the same serial transaction and cross-process lock. */
export async function handleLibraryAction(value: unknown): Promise<unknown> {
  const input = object(value);
  const filename = storageFile();
  const task = queue.then(() => underLock(filename, () => {
    const state = readState(filename);
    if (input.action === "list") return { resources: state.resources, publishedAt: state.publishedAt };
    if (input.action === "backup") return { data: state };
    if (input.action === "import-preview") {
      try { return parseBookmarkHtml(input.html, state.resources.map(resource => resource.url)); }
      catch (error) { throw new LibraryInputError((error as Error).message); }
    }
    if (input.action === "publish-preview") return preview(state);
    if (input.action === "publish") {
      const next = preview(state);
      if (typeof input.revision !== "string" || input.revision !== next.revision) throw new LibraryInputError("资源或公开快照已变化，请重新预览后再发布。", 409);
      const publishedAt = new Date().toISOString();
      const snapshot: PublicLibrarySnapshot = { version: 1, publishedAt, resources: next.resources };
      atomicJson(publicFilename(), snapshot);
      state.publishedAt = publishedAt;
      // Keep a published batch safe from later undo, including after it is made private again.
      for (const resource of state.resources) if (eligible(resource)) resource.importBatchId = "";
      atomicJson(filename, state);
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
      atomicJson(filename, state);
      return { resources: state.resources };
    }
    if (input.action === "bulk") {
      const ids = new Set(validateIds(input.ids));
      const changes = object(input.changes);
      if (!Object.keys(changes).length || Object.keys(changes).some(key => !["category", "status", "pinned", "visibility"].includes(key))) throw new LibraryInputError("批量操作仅支持分类、状态、置顶和可见性。");
      if ([...ids].some(id => !state.resources.some(resource => resource.id === id))) throw new LibraryInputError("部分资源已不存在，请刷新列表。", 404);
      state.resources = state.resources.map(resource => ids.has(resource.id) ? sanitizeSave(changes, resource) : resource);
      atomicJson(filename, state);
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
      atomicJson(filename, state);
      return { resources: state.resources, added: additions.length, skipped, batchId: additions.length ? batchId : "" };
    }
    if (input.action === "undo-import") {
      const batchId = text(input.batchId, 180, "导入批次", true);
      const published = new Set(getPublicResources().map((resource: PublicResource) => resource.id));
      const before = state.resources.length;
      state.resources = state.resources.filter(resource => resource.importBatchId !== batchId || resource.visibility !== "private" || published.has(resource.id));
      atomicJson(filename, state);
      return { resources: state.resources, removed: before - state.resources.length };
    }
    throw new LibraryInputError("不支持此操作。");
  }));
  queue = task.catch(() => undefined);
  return task;
}
