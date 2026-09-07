import { pathToFileURL } from "node:url";
import fs from "node:fs";
import { Pool } from "pg";
import { createTsLoader } from "./lib/load-ts.mjs";
import { selectAdminDatabaseUrl } from "./lib/database-admin-url.mjs";

const ROLE = "vitamin_library_public";
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const identifier = value => `"${String(value).replaceAll('"', '""')}"`;

async function roleRecord(client) {
  return (await client.query(`SELECT r.oid, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls,
    shobj_description(r.oid, 'pg_authid') AS marker FROM pg_roles r WHERE rolname = $1`, [ROLE])).rows[0];
}

async function assertRoleAttributes(client, role) {
  if (role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolbypassrls) throw new Error("The reserved role has elevated privileges; refusing to alter it.");
  const memberships = (await client.query(`SELECT 1 FROM pg_auth_members m WHERE m.member = $1
    OR (m.roleid = $1 AND NOT (m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
      AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option))`, [role.oid])).rows;
  if (memberships.length) throw new Error("The reserved role has unexpected memberships; refusing to alter it.");
}

/** Check grants as the named target before commit; the administrator never impersonates the public role. */
async function assertTargetGrants(client) {
  const row = (await client.query(`SELECT
    EXISTS (SELECT 1 FROM pg_namespace n WHERE left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema'
      AND has_schema_privilege($1, n.oid, 'CREATE')) AS can_create,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.prosecdef AND left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema'
      AND has_function_privilege($1, p.oid, 'EXECUTE')) AS definer_access,
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema'
      AND NOT (n.nspname = 'library_public' AND c.relname = 'snapshot')
      AND has_table_privilege($1, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS other_access,
    has_table_privilege($1, 'library_public.snapshot', 'SELECT') AS can_read,
    has_table_privilege($1, 'library_public.snapshot', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS can_write`, [ROLE])).rows[0];
  if (!row || row.can_create || row.definer_access || row.other_access || !row.can_read || row.can_write) throw new Error("The reserved role has unexpected object grants; refusing to commit.");
}

const connectPublic = connectionString => new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });

/** The reserved role is created explicitly. Existing unrelated roles are never altered. */
export async function provisionPublicRole(pool, publicValue, privateValue, options = {}) {
  const load = createTsLoader();
  const { publicDatabaseConnection } = load("src/lib/cloud-publication.ts");
  const url = publicDatabaseConnection(publicValue, privateValue);
  if (decodeURIComponent(url.username) !== ROLE) throw new Error(`LIBRARY_PUBLIC_DATABASE_URL must use the dedicated ${ROLE} role.`);
  if (new URL(privateValue).hostname.split(".")[0].endsWith("-pooler")) throw new Error("Role setup requires the direct administrative database endpoint.");
  const client = await pool.connect();
  let database;
  try {
    await client.query("BEGIN");
    database = (await client.query("SELECT oid::text AS oid, datname AS name FROM pg_database WHERE datname = current_database()")).rows[0];
    if (!database || database.name !== decodeURIComponent(url.pathname.slice(1))) throw new Error("The active database does not match the reviewed connection URL.");
    // PostgreSQL roles/comments are cluster-wide. A database name plus OID binds updates to this database incarnation.
    const marker = `vitamin-library-public:v2:${encodeURIComponent(database.name)}:${database.oid}`;
    const existing = await roleRecord(client);
    if (existing && existing.marker !== marker) throw new Error("The reserved public role has an unbound or different-database marker; refusing to alter it.");
    if (existing) await assertRoleAttributes(client, existing);
    const password = literal(decodeURIComponent(url.password));
    if (existing) {
      // ALTER's NO* options still require the caller's matching elevated attribute. Never try to downgrade an unsafe role.
      await client.query(`ALTER ROLE ${ROLE} LOGIN NOINHERIT PASSWORD ${password}`);
    } else {
      await client.query(`CREATE ROLE ${ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${password}`);
      await assertRoleAttributes(client, await roleRecord(client));
      await client.query(`COMMENT ON ROLE ${ROLE} IS ${literal(marker)}`);
    }
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await client.query(`REVOKE ALL ON SCHEMA library_private FROM ${ROLE}`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA library_private FROM ${ROLE}`);
    await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA library_private FROM ${ROLE}`);
    await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA library_private FROM ${ROLE}`);
    await client.query(`REVOKE ALL ON SCHEMA library_public FROM ${ROLE}`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA library_public FROM ${ROLE}`);
    await client.query(`GRANT USAGE ON SCHEMA library_public TO ${ROLE}`);
    await client.query(`GRANT SELECT ON library_public.snapshot TO ${ROLE}`);
    await client.query(`ALTER ROLE ${ROLE} IN DATABASE ${identifier(database.name)} SET default_transaction_read_only = on`);
    await assertTargetGrants(client);
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve a safe CLI failure. */ }
    throw error;
  } finally { client.release(); }

  // PG 16+ grants a CREATEROLE creator ADMIN, with SET and INHERIT disabled. Verify a real new login after commit.
  let publicPool;
  try {
    publicPool = await (options.connectPublic ?? connectPublic)(url.toString());
    const identity = (await publicPool.query("SELECT current_user AS role, current_database() AS database")).rows[0];
    if (identity?.role !== ROLE || identity.database !== database.name) throw new Error();
    const { assertPublicLibraryRole } = load("src/lib/cloud-publication.ts");
    await assertPublicLibraryRole(publicPool);
    await publicPool.query("SELECT snapshot FROM library_public.snapshot WHERE singleton = true");
  } catch {
    const error = new Error("Minimal grants were committed, but the independent public login could not be verified. Check its connection and credentials, then rerun; do not add privileges.");
    error.name = "PublicRoleVerificationError";
    throw error;
  } finally { if (publicPool) await publicPool.end(); }
  return { role: ROLE, access: "SELECT library_public.snapshot only", verified: true };
}

async function main() {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  const adminUrl = selectAdminDatabaseUrl();
  if (!adminUrl || !process.env.LIBRARY_PUBLIC_DATABASE_URL) throw new Error("Set the direct DATABASE_ADMIN_URL and LIBRARY_PUBLIC_DATABASE_URL in the private environment first.");
  const pool = new Pool({ connectionString: adminUrl, max: 1, connectionTimeoutMillis: 10000 });
  try { console.log(JSON.stringify(await provisionPublicRole(pool, process.env.LIBRARY_PUBLIC_DATABASE_URL, adminUrl), null, 2)); }
  finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error?.name === "PublicRoleVerificationError" ? error.message : "Public-role setup failed. Check the direct admin URL, public URL, schema migration, database-bound role marker, and existing grants. Credentials and database diagnostics are intentionally omitted.");
    process.exitCode = 1;
  });
}
