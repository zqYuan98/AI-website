import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { getPublicResources } from "./public-resources";
import { type LibraryState, type PublicLibrarySnapshot } from "./resource-types";
import { applyLibraryAction, libraryObject, LibraryInputError, MAX_RESOURCES, MAX_STORE_BYTES } from "./library-domain";
export { LibraryInputError } from "./library-domain";

let queue: Promise<unknown> = Promise.resolve();

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

function readState(filename: string): LibraryState {
  if (!fs.existsSync(filename)) {
    const state: LibraryState = { version: 1, publishedAt: currentPublishedAt(), resources: getPublicResources().map(resource => ({
      ...resource, visibility: "public", status: "organized", pinned: false, notes: "", source: "既有公开资源", sourceFolder: "", createdAt: "", importBatchId: "",
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
  const input = libraryObject(value);
  const filename = storageFile();
  const task = queue.then(() => underLock(filename, () => {
    const state = readState(filename);
    const current: PublicLibrarySnapshot = { version: 1, publishedAt: currentPublishedAt(), resources: getPublicResources() };
    const transition = applyLibraryAction(state, input, current);
    if (transition.publishedSnapshot) atomicJson(publicFilename(), transition.publishedSnapshot);
    if (transition.changed) atomicJson(filename, transition.state);
    return transition.result;
  }));
  queue = task.catch(() => undefined);
  return task;
}
