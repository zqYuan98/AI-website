import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { createTsLoader } from "./lib/load-ts.mjs";
import { selectAdminDatabaseUrl } from "./lib/database-admin-url.mjs";

const root = process.cwd();
const load = createTsLoader(root);
const { createCloudLibraryStore } = load("src/lib/cloud-library.ts");
const { normalizePublicSnapshot, MAX_STORE_BYTES, LibraryInputError } = load("src/lib/library-domain.ts");
const args = process.argv.slice(2);
const command = args[0];
function argument(name) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }

function reviewedPublicSnapshot(value) {
  const snapshotKeys = new Set(["version", "publishedAt", "resources"]);
  const resourceKeys = new Set(["id", "name", "url", "icon", "kind", "category", "subcategory", "tags", "description", "recommendation", "audience", "usage", "boundary", "alternatives", "featured", "usedByVitamin", "relatedHref", "updatedAt"]);
  const record = item => item !== null && typeof item === "object" && !Array.isArray(item);
  // Importing a complete private backup here would turn private/inbox entries public after projection.
  // Source selection must reject private/unknown fields; publication itself still uses its normal allowlist projection.
  if (!record(value) || Object.keys(value).some(key => !snapshotKeys.has(key)) || !Array.isArray(value.resources)
    || value.resources.some(item => !record(item) || Object.keys(item).some(key => !resourceKeys.has(key)))) {
    throw new LibraryInputError("来源包含私人字段或公开快照契约外的数据；完整私人备份请改用 preview-restore，不能作为公开快照初始化。");
  }
  return normalizePublicSnapshot(value);
}

function publishedSource() {
  const filename = path.join(root, "content", "resource-library.json");
  const supplied = argument("--published-snapshot");
  const legacy = args.includes("--verified-legacy");
  if (Boolean(supplied) === legacy) throw new LibraryInputError("初始化需明确选择 --published-snapshot PATH（已核对线上部署版本）或 --verified-legacy（已确认线上仍是旧基线）。");
  // A local publish file may never have been deployed. Only an explicitly reviewed source can become the cloud baseline.
  if (supplied) {
    if (fs.statSync(supplied).size > MAX_STORE_BYTES) throw new LibraryInputError("公开快照超过 32 MB 限制。");
    return { source: "explicitly-verified-published-snapshot", snapshot: reviewedPublicSnapshot(JSON.parse(fs.readFileSync(supplied, "utf8"))) };
  }
  if (fs.existsSync(filename)) throw new LibraryInputError("本机存在公开快照候选；请核对线上版本后用 --published-snapshot 显式指定基线，不可自动忽略候选并采用旧基线。");
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all", "--", "content", "src/lib/public-resources.ts", "src/lib/curation.ts", "src/lib/tool-taxonomy.ts", "src/lib/tool-url.ts", "src/lib/resource-types.ts", "public/images/tools"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (dirty.trim()) throw new LibraryInputError("旧基线相关内容存在未提交变更；请显式提供已核对线上版本的 --published-snapshot 文件。");
  return { source: "explicitly-verified-legacy-baseline", snapshot: { version: 1, publishedAt: "", resources: load("src/lib/public-resources.ts").getLegacyPublicResources() } };
}

function backupInput() {
  const filename = argument("--backup");
  if (!filename) throw new Error("Pass an explicit --backup path; no private library is discovered automatically.");
  if (fs.statSync(filename).size > MAX_STORE_BYTES) throw new Error("Backup exceeds the 32 MB limit.");
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

async function main() {
  if (fs.existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));
  if (!["source-preview", "migrate", "preview-initialize", "initialize", "preview-restore", "restore", "backup"].includes(command)) throw new Error("Use source-preview, migrate, preview-initialize, initialize --confirm HASH, preview-restore --backup PATH, restore --backup PATH --revision VERSION --confirm HASH, or backup --output PATH.");
  if (command === "source-preview") {
    const source = publishedSource();
    console.log(JSON.stringify({ source: source.source, count: source.snapshot.resources.length, publishedAt: source.snapshot.publishedAt }, null, 2));
    return;
  }
  const owner = process.env.LIBRARY_OWNER_ID?.trim();
  if (!process.env.DATABASE_URL || !owner) throw new Error("Set DATABASE_URL and LIBRARY_OWNER_ID in the private environment first.");
  const pool = new Pool({ connectionString: selectAdminDatabaseUrl(), max: 1, connectionTimeoutMillis: 10000 });
  const store = createCloudLibraryStore(pool, () => owner);
  try {
    let result;
    if (command === "migrate") {
      for (const filename of ["library-001.sql", "library-002-imports.sql", "library-003-smart-api.sql", "library-004-analysis.sql"]) {
        await pool.query(fs.readFileSync(path.join(root, "migrations", filename), "utf8"));
      }
      result = { migrated: true, initialized: false };
    } else if (command === "preview-initialize") {
      const source = publishedSource();
      result = { source: source.source, ...await store.initializationPreview(source.snapshot, owner) };
    } else if (command === "initialize") {
      result = await store.initialize(publishedSource().snapshot, owner, argument("--confirm"));
    } else if (command === "preview-restore") {
      result = await store.restorePreview(backupInput(), owner);
    } else if (command === "restore") {
      result = await store.restore(backupInput(), owner, argument("--revision"), argument("--confirm"));
    } else {
      const output = argument("--output");
      if (!output) throw new Error("Pass --output PATH outside this repository for the private backup.");
      const resolved = path.resolve(output);
      const parent = fs.realpathSync(path.dirname(resolved));
      const relative = path.relative(fs.realpathSync(root), path.join(parent, path.basename(resolved)));
      if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("Private backups must be written outside this repository.");
      const response = await store.handle({ action: "backup" }, owner);
      fs.writeFileSync(resolved, `${JSON.stringify(response.data, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      result = { backedUp: true, libraryRevision: response.libraryRevision };
    }
    console.log(JSON.stringify(result, null, 2));
  } finally { await pool.end(); }
}

main().catch(error => {
  const safe = error instanceof LibraryInputError ? error.message : "Cloud-library command failed. Check the command arguments, explicit backup file and database configuration; no database diagnostics or credentials are printed.";
  console.error(safe);
  process.exitCode = 1;
});
