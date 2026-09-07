import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { createTsLoader } from "./lib/load-ts.mjs";
import { createPglitePool } from "./lib/pglite-pool.mjs";
import { provisionPublicRole } from "./cloud-library-roles.mjs";
import { selectAdminDatabaseUrl } from "./lib/database-admin-url.mjs";

const load = createTsLoader();
const { createCloudLibraryStore } = load("src/lib/cloud-library.ts");
const { readPublishedSnapshot, assertPublicLibraryRole, publicDatabaseConnection } = load("src/lib/cloud-publication.ts");
const { normalizeLibraryState } = load("src/lib/library-domain.ts");
const { getLegacyPublicResources } = load("src/lib/public-resources.ts");
const dbURL = process.env.CLOUD_LIBRARY_TEST_DATABASE_URL;
// The optional pg target must be an explicitly disposable, empty database. Never use DATABASE_URL here.
let db, pool;
if (dbURL) pool = new Pool({ connectionString: dbURL, max: 4, connectionTimeoutMillis: 10000 });
else { db = new PGlite(); pool = createPglitePool(db); }
const owner = "cloud-library-test-owner";
const store = createCloudLibraryStore(pool, () => owner);
const migration = fs.readFileSync(new URL("../migrations/library-001.sql", import.meta.url), "utf8");
const status = expected => error => error?.status === expected;
let revision;
const list = async () => { const result = await store.handle({ action: "list" }, owner); revision = result.libraryRevision; return result; };
const write = async input => { const result = await store.handle({ ...input, libraryRevision: revision }, owner); revision = result.libraryRevision; return result; };

try {
  const preexisting = await pool.query("SELECT nspname FROM pg_namespace WHERE nspname IN ('library_private', 'library_public')");
  assert.equal(preexisting.rows.length, 0, "Use an empty, disposable test database; existing library schemas will not be modified.");
  const reservedRole = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = 'vitamin_library_public'");
  assert.equal(reservedRole.rows.length, 0, "The test must not rotate an existing public role's credentials. Use an isolated disposable PostgreSQL instance.");
  if (db) {
    assert.equal((await pool.query("SELECT rolsuper FROM pg_roles WHERE rolname = current_user")).rows[0].rolsuper, true, "PGlite uses its bootstrap superuser only to establish non-superuser test sessions.");
    assert.equal((await pool.query("SELECT 1 FROM pg_roles WHERE rolname = 'vitamin_library_setup_test_admin'")).rows.length, 0, "Use an isolated fixture without an existing test administrator.");
  } else {
    const administrator = (await pool.query("SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname = current_user")).rows[0];
    assert.equal(administrator.rolsuper, false, "Use the actual non-superuser Neon administrator for remote compatibility checks.");
    assert.equal(administrator.rolcreaterole, true, "The isolated integration administrator needs CREATEROLE.");
  }
  if (db) await db.exec(migration); else await pool.query(migration);
  await assert.rejects(() => readPublishedSnapshot(pool), status(503));
  await assert.rejects(() => store.handle({ action: "list" }, owner), status(503));
  await assert.rejects(() => store.handle({ action: "list" }, "not-owner"), status(403));
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM library_private.state")).rows[0].count, 0, "Reads must never initialize.");
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-source-check-"));
  const sourceFile = path.join(fixtureDirectory, "published.json");
  try {
    fs.writeFileSync(sourceFile, JSON.stringify({ version: 1, publishedAt: "", resources: [] }));
    const command = path.join(process.cwd(), "scripts", "cloud-library.mjs");
    const explicit = spawnSync(process.execPath, [command, "source-preview", "--published-snapshot", sourceFile], { encoding: "utf8", windowsHide: true });
    assert.equal(explicit.status, 0, explicit.stderr);
    assert.equal(JSON.parse(explicit.stdout).count, 0, "An explicit empty source never falls back to legacy.");
    const implicit = spawnSync(process.execPath, [command, "source-preview"], { encoding: "utf8", windowsHide: true });
    assert.equal(implicit.status, 1, "Migration must require an explicitly verified publication source.");
    fs.writeFileSync(sourceFile, "not-json");
    const invalid = spawnSync(process.execPath, [command, "source-preview", "--published-snapshot", sourceFile], { encoding: "utf8", windowsHide: true });
    assert.equal(invalid.status, 1, "An invalid source never falls back to legacy.");
    const publicFixture = getLegacyPublicResources()[0];
    const privateFixture = { ...publicFixture, visibility: "private", status: "inbox", notes: "NEVER-PUBLISH-PRIVATE-SOURCE", pinned: false, source: "private backup", sourceFolder: "private folder", createdAt: "", importBatchId: "" };
    const rejectedSources = [
      { version: 1, publishedAt: "", resources: [privateFixture] },
      { version: 1, publishedAt: "", resources: [publicFixture, privateFixture] },
      { version: 1, publishedAt: "", resources: [publicFixture], libraryRevision: "1" },
      { version: 1, publishedAt: "", resources: [{ ...publicFixture, unexpectedPrivateMetadata: "not public" }] },
    ];
    for (const source of rejectedSources) {
      fs.writeFileSync(sourceFile, JSON.stringify(source));
      const rejected = spawnSync(process.execPath, [command, "source-preview", "--published-snapshot", sourceFile], { encoding: "utf8", windowsHide: true });
      assert.equal(rejected.status, 1, "Private backups, mixed inbox entries and unknown source fields must not become a public baseline.");
      assert.match(rejected.stderr, /preview-restore/);
    }
    fs.writeFileSync(sourceFile, JSON.stringify({ version: 1, publishedAt: "", resources: [publicFixture] }));
    const validPublic = spawnSync(process.execPath, [command, "source-preview", "--published-snapshot", sourceFile], { encoding: "utf8", windowsHide: true });
    assert.equal(validPublic.status, 0, validPublic.stderr);
    assert.equal(JSON.parse(validPublic.stdout).count, 1);
  } finally { fs.unlinkSync(sourceFile); fs.rmdirSync(fixtureDirectory); }

  const baseline = { version: 1, publishedAt: "", resources: getLegacyPublicResources() };
  assert.equal(baseline.resources.length, 274);
  const seed = await store.initializationPreview(baseline, owner);
  await assert.rejects(() => store.initialize(baseline, owner, "stale"), status(409));
  await store.initialize(baseline, owner, seed.confirmation);
  assert.deepEqual(await readPublishedSnapshot(pool), baseline);
  const initial = await list();
  assert.equal(revision, "1");
  assert.equal(initial.publishedIds.length, 274);
  assert.ok(initial.resources.every(resource => resource.visibility === "public" && resource.status === "organized" && resource.createdAt === ""));
  const rerun = await store.initializationPreview({ version: 1, publishedAt: "", resources: [] }, owner);
  assert.equal((await store.initialize({ version: 1, publishedAt: "", resources: [] }, owner, rerun.confirmation)).changed, false);
  assert.equal((await readPublishedSnapshot(pool)).resources.length, 274, "Idempotent initialization cannot replace a live publication.");

  await assert.rejects(() => store.handle({ action: "save", resource: { name: "Missing revision", url: "https://missing.example.com" } }, owner), status(428));
  let saved = await write({ action: "save", resource: { name: "Private fixture", url: "https://private.example.com", notes: "PRIVATE-NOTES-SENTINEL", visibility: "public", status: "organized", usedByVitamin: true } });
  const fixture = saved.resources[0];
  assert.equal(fixture.visibility, "private");
  assert.equal(fixture.status, "inbox");
  assert.equal(fixture.usedByVitamin, false);
  assert.equal(saved.publishedIds.length, 274);
  assert.deepEqual(await readPublishedSnapshot(pool), baseline, "Ordinary saves never publish.");
  await assert.rejects(() => store.handle({ action: "save", libraryRevision: "1", resource: { ...fixture, name: "Stale tab" } }, owner), status(409));
  assert.equal((await list()).resources[0].name, fixture.name);

  const oldRevision = revision;
  const simultaneous = await Promise.allSettled(["One", "Two"].map(name => store.handle({ action: "save", libraryRevision: oldRevision, resource: { name, url: `https://${name.toLowerCase()}.example.com` } }, owner)));
  assert.equal(simultaneous.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(simultaneous.filter(result => result.status === "rejected" && result.reason.status === 409).length, 1);
  await list();

  const parsed = await store.handle({ action: "import-preview", html: '<DL><DT><H3>PRIVATE-FOLDER-SENTINEL</H3><DL><DT><A HREF="https://import.example.com" ADD_DATE="1700000000">Imported</A><DT><A HREF="https://undo.example.com">Undo</A></DL></DL>' }, owner);
  assert.equal(parsed.libraryRevision, revision);
  const imported = await write({ action: "import", items: parsed.items });
  const importedResource = imported.resources.find(resource => resource.url === "https://import.example.com/");
  assert.equal(importedResource.sourceFolder, "PRIVATE-FOLDER-SENTINEL");
  assert.equal(importedResource.createdAt, "2023-11-14T22:13:20.000Z");
  assert.ok(importedResource.importedAt);
  await write({ action: "save", resource: { ...importedResource, status: "organized", visibility: "public", notes: "SECOND-PRIVATE-SENTINEL", recommendation: "Reviewed fixture", featured: true } });
  const preview = await store.handle({ action: "publish-preview" }, owner);
  assert.equal(preview.libraryRevision, revision);
  assert.equal(preview.resources.length, 275);
  assert.ok(!JSON.stringify(preview.resources).includes("PRIVATE-SENTINEL"));
  assert.ok(!JSON.stringify(preview.resources).includes("PRIVATE-FOLDER"));
  await write({ action: "save", resource: { ...fixture, name: "Updated private fixture" } });
  await assert.rejects(() => write({ action: "publish", revision: preview.revision }), status(409));
  const publish = await store.handle({ action: "publish-preview" }, owner);
  const committed = await write({ action: "publish", revision: publish.revision });
  assert.equal(committed.count, 275);
  assert.equal(committed.publishedIds.length, 275);
  const published = await readPublishedSnapshot(pool);
  const projected = published.resources.find(resource => resource.id === importedResource.id);
  for (const key of ["notes", "pinned", "source", "sourceFolder", "createdAt", "importedAt", "importBatchId", "visibility", "status"]) assert.equal(Object.hasOwn(projected, key), false, key);
  const afterPublish = await list();
  assert.equal(afterPublish.resources.find(resource => resource.id === importedResource.id).importBatchId, "");
  await write({ action: "save", resource: { ...importedResource, status: "archived", visibility: "private", featured: false } });
  assert.equal((await readPublishedSnapshot(pool)).resources.length, 275);
  const undone = await write({ action: "undo-import", batchId: imported.batchId });
  assert.equal(undone.removed, 1);
  assert.ok(undone.resources.some(resource => resource.id === importedResource.id));

  const beforeRollback = await store.handle({ action: "backup" }, owner);
  await pool.query("ALTER TABLE library_public.snapshot ADD CONSTRAINT reject_test_publication CHECK (false) NOT VALID");
  const failurePreview = await store.handle({ action: "publish-preview" }, owner);
  await assert.rejects(() => write({ action: "publish", revision: failurePreview.revision }));
  assert.deepEqual(await store.handle({ action: "backup" }, owner), beforeRollback, "Publication failure must roll back draft metadata and revision.");
  assert.deepEqual(await readPublishedSnapshot(pool), published);
  await pool.query("ALTER TABLE library_public.snapshot DROP CONSTRAINT reject_test_publication");

  const privateBackup = structuredClone(beforeRollback.data);
  privateBackup.resources = privateBackup.resources.filter(resource => resource.id === fixture.id);
  privateBackup.resources[0].notes = "RESTORED-PRIVATE-NOTES";
  privateBackup.resources[0].sourceFolder = "RESTORED-PRIVATE-FOLDER";
  privateBackup.resources[0].pinned = true;
  privateBackup.resources[0].extraSecret = "MUST-BE-DROPPED";
  privateBackup.extraPrivateValue = "MUST-BE-DROPPED";
  const restorePreview = await store.restorePreview(privateBackup, owner);
  assert.ok(restorePreview.removedIds.length > 0);
  assert.ok(restorePreview.idConflicts.includes(fixture.id));
  await assert.rejects(() => store.restore(privateBackup, owner, revision, "wrong"), status(409));
  await store.restore(privateBackup, owner, restorePreview.libraryRevision, restorePreview.confirmation);
  const restored = await list();
  assert.equal(restored.resources.length, 1);
  assert.equal(restored.resources[0].notes, "RESTORED-PRIVATE-NOTES");
  assert.equal(restored.resources[0].pinned, true);
  assert.equal(restored.resources[0].extraSecret, undefined);
  assert.deepEqual(await readPublishedSnapshot(pool), published, "Replacing the private draft must not replace its publication.");
  await assert.rejects(() => store.restore(privateBackup, owner, restorePreview.libraryRevision, restorePreview.confirmation), status(409));
  assert.throws(() => normalizeLibraryState({ ...privateBackup, resources: [{ ...privateBackup.resources[0], visibility: "public", status: "inbox" }] }));

  const emptyPreview = await store.handle({ action: "publish-preview" }, owner);
  assert.equal(emptyPreview.resources.length, 0);
  await write({ action: "publish", revision: emptyPreview.revision });
  assert.equal((await readPublishedSnapshot(pool)).resources.length, 0, "Explicit empty publication never resurrects legacy resources.");
  await pool.query("UPDATE library_private.state SET owner_id = 'other-owner' WHERE singleton = true");
  await assert.rejects(() => store.handle({ action: "list" }, owner), status(403));
  await pool.query("UPDATE library_private.state SET owner_id = $1 WHERE singleton = true", [owner]);

  publicDatabaseConnection("postgres://vitamin_library_public:fixture@ep-test-pooler.us.neon.tech/app", "postgresql://owner:fixture@ep-test.us.neon.tech:5432/app");
  for (const bad of ["postgres://owner:fixture@ep-test.us.neon.tech/app", "postgres://public:fixture@ep-other.us.neon.tech/app", "postgres://public:fixture@ep-test.us.neon.tech/other", "postgres://public:fixture@ep-test.us.neon.tech:5555/app"]) assert.throws(() => publicDatabaseConnection(bad, "postgres://owner:fixture@ep-test.us.neon.tech/app"));
  assert.throws(() => publicDatabaseConnection("postgres://public:fixture@localhost", "postgres://owner:fixture@localhost"), "Implicit database names differ between roles and must be rejected.");
  const runtimeConnection = "postgres://owner:fixture@ep-test-pooler.us.neon.tech/app";
  const directConnection = "postgres://owner:fixture@ep-test.us.neon.tech:5432/app";
  assert.equal(selectAdminDatabaseUrl({ DATABASE_URL: runtimeConnection }), runtimeConnection);
  assert.equal(selectAdminDatabaseUrl({ DATABASE_URL: runtimeConnection, DATABASE_ADMIN_URL: directConnection }), directConnection);
  for (const bad of ["postgres://owner:fixture@ep-other.us.neon.tech/app", "postgres://owner:fixture@ep-test.us.neon.tech/other", "postgres://owner:fixture@ep-test.us.neon.tech:5555/app", "postgres://other-owner:fixture@ep-test.us.neon.tech/app", runtimeConnection]) {
    assert.throws(() => selectAdminDatabaseUrl({ DATABASE_URL: runtimeConnection, DATABASE_ADMIN_URL: bad }));
  }
  assert.throws(() => selectAdminDatabaseUrl({ DATABASE_ADMIN_URL: directConnection }));

  await pool.query("CREATE TABLE public.library_auth_user (id text PRIMARY KEY, password_hash text NOT NULL)");
  await pool.query("REVOKE ALL ON public.library_auth_user FROM PUBLIC");
  await pool.query("INSERT INTO public.library_auth_user VALUES ('owner', 'AUTH-SECRET-SENTINEL')");
  const fixtureDatabase = (await pool.query("SELECT current_database() AS name")).rows[0].name;
  const bootstrapRole = (await pool.query("SELECT session_user AS name")).rows[0].name;
  const quoteIdentifier = value => `"${value.replaceAll('"', '""')}"`;
  const setupRole = db ? "vitamin_library_setup_test_admin" : bootstrapRole;
  if (db) {
    await pool.query(`CREATE ROLE ${setupRole} LOGIN CREATEROLE NOINHERIT PASSWORD 'admin-fixture-only'`);
    await pool.query(`ALTER DATABASE ${quoteIdentifier(fixtureDatabase)} OWNER TO ${setupRole}`);
    await pool.query(`ALTER SCHEMA library_private OWNER TO ${setupRole}`);
    await pool.query(`ALTER SCHEMA library_public OWNER TO ${setupRole}`);
    await pool.query(`ALTER TABLE library_private.state OWNER TO ${setupRole}`);
    await pool.query(`ALTER TABLE library_public.snapshot OWNER TO ${setupRole}`);
    await pool.query(`ALTER TABLE public.library_auth_user OWNER TO ${setupRole}`);
  }

  async function superQuery(sql, values = []) {
    const client = await pool.connect();
    try {
      if (db) await client.query(`SET SESSION AUTHORIZATION ${quoteIdentifier(bootstrapRole)}`);
      return await client.query(sql, values);
    }
    finally { client.release(); }
  }
  function sessionPool(role) {
    return {
      async connect() {
        const client = await pool.connect();
        await client.query(`SET SESSION AUTHORIZATION ${quoteIdentifier(bootstrapRole)}`);
        await client.query(`SET SESSION AUTHORIZATION ${quoteIdentifier(role)}`);
        return client;
      },
      async query(sql, values = []) {
        const client = await this.connect();
        try { return await client.query(sql, values); } finally { client.release(); }
      },
      async end() { await superQuery("SELECT 1"); },
    };
  }
  const adminUrl = new URL(dbURL || `postgres://postgres:fixture@localhost/${fixtureDatabase}`);
  if (db) { adminUrl.username = setupRole; adminUrl.password = "admin-fixture-only"; }
  const publicUrl = new URL(adminUrl);
  publicUrl.username = "vitamin_library_public";
  publicUrl.password = randomBytes(24).toString("base64url");
  const adminPool = db ? sessionPool(setupRole) : new Pool({ connectionString: adminUrl.toString(), max: 1 });
  const newPublicPool = () => db ? sessionPool("vitamin_library_public") : new Pool({ connectionString: publicUrl.toString(), max: 1 });
  let independentConnections = 0;
  const provision = (options = {}) => provisionPublicRole(adminPool, publicUrl.toString(), adminUrl.toString(), {
    connectPublic: () => { independentConnections++; return newPublicPool(); }, ...options,
  });
  const ordinary = (await adminPool.query("SELECT current_user AS name, rolsuper, rolcreatedb, rolreplication, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname = current_user")).rows[0];
  if (db) assert.deepEqual(ordinary, { name: setupRole, rolsuper: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false, rolcreaterole: true });
  else { assert.equal(ordinary.rolsuper, false); assert.equal(ordinary.rolcreaterole, true); }
  await provision();
  assert.equal(independentConnections, 1, "Public access must be verified through a separate login after commit.");
  const membership = (await adminPool.query("SELECT admin_option, inherit_option, set_option FROM pg_auth_members WHERE roleid = 'vitamin_library_public'::regrole AND member = current_user::regrole")).rows[0];
  assert.deepEqual(membership, { admin_option: true, inherit_option: false, set_option: false });
  await assert.rejects(() => adminPool.query("SET ROLE vitamin_library_public"), error => error.code === "42501", "The non-superuser creator really cannot SET ROLE.");
  await assert.rejects(() => adminPool.query("ALTER ROLE vitamin_library_public NOSUPERUSER"), error => error.code === "42501", "Old repeated provisioning SQL must fail under the actual test identity.");
  await provision();
  assert.equal(independentConnections, 2, "Safe repeated provisioning must work without elevated ALTER options.");

  const publicPool = newPublicPool();
  try {
    await assertPublicLibraryRole(publicPool);
    assert.equal((await readPublishedSnapshot(publicPool)).resources.length, 0);
    await publicPool.query("SET default_transaction_read_only = off");
    await assert.rejects(() => publicPool.query("SELECT state FROM library_private.state"), error => error.code === "42501");
    await assert.rejects(() => publicPool.query("SELECT password_hash FROM public.library_auth_user"), error => error.code === "42501");
    await assert.rejects(() => publicPool.query("DELETE FROM library_public.snapshot"), error => error.code === "42501");
    await assert.rejects(() => publicPool.query("CREATE TABLE public.public_role_must_not_write (id int)"), error => error.code === "42501");
  } finally { await publicPool.end(); }

  const originalMarker = (await superQuery("SELECT shobj_description('vitamin_library_public'::regrole::oid, 'pg_authid') AS marker")).rows[0].marker;
  assert.match(originalMarker, /^vitamin-library-public:v2:/);
  await superQuery("COMMENT ON ROLE vitamin_library_public IS 'vitamin-library-public:v2:another-database:1'");
  await assert.rejects(() => provision(), /different-database marker/);
  await superQuery("COMMENT ON ROLE vitamin_library_public IS 'vitamin-library-public:v1'");
  await assert.rejects(() => provision(), /different-database marker/, "A cluster-global legacy marker cannot establish database ownership.");
  await superQuery(`COMMENT ON ROLE vitamin_library_public IS '${originalMarker.replaceAll("'", "''")}'`);
  if (db) {
    for (const attribute of ["SUPERUSER", "CREATEDB", "CREATEROLE", "REPLICATION", "BYPASSRLS"]) {
      await superQuery(`ALTER ROLE vitamin_library_public ${attribute}`);
      await assert.rejects(() => provision(), /elevated privileges/);
      await superQuery(`ALTER ROLE vitamin_library_public NO${attribute}`);
    }
  }
  await superQuery("CREATE ROLE unexpected_library_membership");
  await superQuery("GRANT unexpected_library_membership TO vitamin_library_public");
  await assert.rejects(() => provision(), /unexpected memberships/);
  await superQuery("REVOKE unexpected_library_membership FROM vitamin_library_public");
  await superQuery("GRANT vitamin_library_public TO unexpected_library_membership");
  await assert.rejects(() => provision(), /unexpected memberships/);
  await superQuery("REVOKE vitamin_library_public FROM unexpected_library_membership");

  await superQuery("GRANT SELECT ON public.library_auth_user TO vitamin_library_public");
  await assert.rejects(() => provision(), /unexpected object grants/, "Overprivileged existing roles must be rejected before commit.");
  const tainted = newPublicPool();
  try {
    await assert.rejects(() => assertPublicLibraryRole(tainted), status(503));
  } finally { await tainted.end(); }
  await superQuery("REVOKE SELECT ON public.library_auth_user FROM vitamin_library_public");
  await superQuery("GRANT CREATE ON SCHEMA public TO vitamin_library_public");
  await assert.rejects(() => provision(), /unexpected object grants/);
  await superQuery("REVOKE CREATE ON SCHEMA public FROM vitamin_library_public");
  await assert.rejects(() => provision({ connectPublic: () => { throw new Error("Simulated independent login failure"); } }), error => error.name === "PublicRoleVerificationError");
  assert.equal((await superQuery("SELECT has_table_privilege('vitamin_library_public', 'library_public.snapshot', 'SELECT') AS read, has_table_privilege('vitamin_library_public', 'public.library_auth_user', 'SELECT') AS private")).rows[0].private, false, "Failed verification must not grant extra permissions.");
  await provision();
  await adminPool.end();

  console.log(`PASS: ${dbURL ? "isolated PostgreSQL" : "PGlite PostgreSQL"} migrations, 274-resource baseline, fixed owner, required/stale revisions, competing writes, private defaults, import/undo, publication allowlist, rollback, restore isolation, explicit empty snapshot and restricted public/auth SQL privileges.`);
} finally {
  // A caller-owned pg database is deliberately left intact for inspection and explicit disposal.
  if (db) await db.close(); else await pool.end();
}
