import { pathToFileURL } from "node:url";
import fs from "node:fs";
import { Pool } from "pg";
import { createTsLoader } from "./lib/load-ts.mjs";

const ROLE = "vitamin_library_public";
const MARKER = "vitamin-library-public:v1";
const literal = value => `'${String(value).replaceAll("'", "''")}'`;

/** The reserved role is created explicitly. Existing unrelated roles are never altered. */
export async function provisionPublicRole(pool, publicValue, privateValue) {
  const load = createTsLoader();
  const { publicDatabaseConnection } = load("src/lib/cloud-publication.ts");
  const url = publicDatabaseConnection(publicValue, privateValue);
  if (decodeURIComponent(url.username) !== ROLE) throw new Error(`PUBLIC_DATABASE_URL must use the dedicated ${ROLE} role.`);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = (await client.query("SELECT r.oid, shobj_description(r.oid, 'pg_authid') AS marker FROM pg_roles r WHERE rolname = $1", [ROLE])).rows[0];
    if (existing && existing.marker !== MARKER) throw new Error("The reserved public role already exists without this application's marker; refusing to alter it.");
    if (existing) {
      const memberships = (await client.query("SELECT 1 FROM pg_auth_members WHERE member = $1", [existing.oid])).rows;
      if (memberships.length) throw new Error("The public role has inherited memberships; remove them explicitly before provisioning.");
    }
    const password = literal(decodeURIComponent(url.password));
    await client.query(`${existing ? "ALTER" : "CREATE"} ROLE ${ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${password}`);
    await client.query(`COMMENT ON ROLE ${ROLE} IS ${literal(MARKER)}`);
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await client.query(`REVOKE ALL ON SCHEMA library_private FROM ${ROLE}`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA library_private FROM ${ROLE}`);
    await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA library_private FROM ${ROLE}`);
    await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA library_private FROM ${ROLE}`);
    await client.query(`REVOKE ALL ON SCHEMA library_public FROM ${ROLE}`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA library_public FROM ${ROLE}`);
    await client.query(`GRANT USAGE ON SCHEMA library_public TO ${ROLE}`);
    await client.query(`GRANT SELECT ON library_public.snapshot TO ${ROLE}`);
    await client.query(`ALTER ROLE ${ROLE} SET default_transaction_read_only = on`);
    await client.query(`SET LOCAL ROLE ${ROLE}`);
    const { assertPublicLibraryRole } = load("src/lib/cloud-publication.ts");
    await assertPublicLibraryRole(client);
    await client.query("RESET ROLE");
    await client.query("COMMIT");
    return { role: ROLE, access: "SELECT library_public.snapshot only" };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve a safe CLI failure. */ }
    throw error;
  } finally { client.release(); }
}

async function main() {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  if (!process.env.DATABASE_URL || !process.env.PUBLIC_DATABASE_URL) throw new Error("Set DATABASE_URL and PUBLIC_DATABASE_URL in the private environment first.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try { console.log(JSON.stringify(await provisionPublicRole(pool, process.env.PUBLIC_DATABASE_URL, process.env.DATABASE_URL), null, 2)); }
  finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Public-role setup failed. Check the two database URLs, schema migration, reserved role ownership, and existing grants. Credentials and database diagnostics are intentionally omitted."); process.exitCode = 1; });
}
