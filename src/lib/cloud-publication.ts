import "server-only";

import { Pool } from "pg";
import { LibraryInputError, normalizePublicSnapshot } from "./library-domain";
import type { PublicLibrarySnapshot } from "./resource-types";

type PublishedPool = { query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

/** A pooled Neon endpoint may differ only by the -pooler suffix in its first hostname label. */
export function publicDatabaseConnection(publicValue: string, privateValue: string): URL {
  try {
    const url = new URL(publicValue), privateUrl = new URL(privateValue);
    const host = (value: URL) => value.hostname.split(".").map((part, index) => index === 0 ? part.replace(/-pooler$/, "") : part).join(".");
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !["postgres:", "postgresql:"].includes(privateUrl.protocol) || !url.username || !url.password || url.pathname.length < 2 || privateUrl.pathname.length < 2 || decodeURIComponent(url.username) === decodeURIComponent(privateUrl.username)
      || host(url) !== host(privateUrl) || (url.port || "5432") !== (privateUrl.port || "5432") || decodeURIComponent(url.pathname) !== decodeURIComponent(privateUrl.pathname)) throw new Error();
    return url;
  } catch { throw new LibraryInputError("公开连接必须使用同一数据库的独立只读角色。", 503); }
}

/** Metadata-only privilege check; no private/auth row is queried by the public reader. */
export async function assertPublicLibraryRole(pool: PublishedPool) {
  const result = await pool.query(`SELECT
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls)) AS powerful,
    EXISTS (SELECT 1 FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = current_user)) AS member,
    EXISTS (SELECT 1 FROM pg_namespace n WHERE left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema'
      AND has_schema_privilege(current_user, n.oid, 'CREATE')) AS can_create,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.prosecdef AND left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema'
      AND has_function_privilege(current_user, p.oid, 'EXECUTE')) AS definer_access,
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema'
      AND NOT (n.nspname = 'library_public' AND c.relname = 'snapshot')
      AND has_table_privilege(current_user, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS other_access,
    has_table_privilege(current_user, 'library_public.snapshot', 'SELECT') AS can_read,
    has_table_privilege(current_user, 'library_public.snapshot', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS can_write`);
  const row = result.rows[0];
  if (!row || row.powerful || row.member || row.can_create || row.definer_access || row.other_access || !row.can_read || row.can_write) throw new LibraryInputError("公开数据连接权限不正确。", 503);
}

let publicPool: Pool | undefined;
function getPublicPool(): Pool {
  if (publicPool) return publicPool;
  try {
    const url = publicDatabaseConnection(process.env.PUBLIC_DATABASE_URL || "", process.env.DATABASE_URL || "");
    publicPool = new Pool({ connectionString: url.toString(), max: 3, idleTimeoutMillis: 20000, connectionTimeoutMillis: 10000, allowExitOnIdle: true });
    publicPool.on("error", () => console.error("[cloud-library] Public database connection failed."));
    return publicPool;
  } catch { throw new LibraryInputError("公开数据连接尚未完成配置。", 503); }
}

export async function readCloudPublicSnapshot(): Promise<PublicLibrarySnapshot> {
  if (process.env.RESOURCE_LIBRARY_MODE !== "cloud") throw new LibraryInputError("线上资源库尚未启用。", 404);
  const pool = getPublicPool();
  await assertPublicLibraryRole(pool);
  return readPublishedSnapshot(pool);
}

export async function readPublishedSnapshot(pool: PublishedPool): Promise<PublicLibrarySnapshot> {
  const result = await pool.query("SELECT snapshot FROM library_public.snapshot WHERE singleton = true");
  if (!result.rows[0]) throw new LibraryInputError("公开快照尚未初始化。", 503);
  return normalizePublicSnapshot(result.rows[0].snapshot);
}
