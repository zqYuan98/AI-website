import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { createTsLoader } from "./lib/load-ts.mjs";
import { createPglitePool } from "./lib/pglite-pool.mjs";
import { provisionPublicRole } from "./cloud-library-roles.mjs";

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

  await pool.query("CREATE TABLE public.library_auth_user (id text PRIMARY KEY, password_hash text NOT NULL)");
  await pool.query("REVOKE ALL ON public.library_auth_user FROM PUBLIC");
  await pool.query("INSERT INTO public.library_auth_user VALUES ('owner', 'AUTH-SECRET-SENTINEL')");
  await provisionPublicRole(pool, "postgres://vitamin_library_public:test-fixture-only@localhost/app", "postgres://owner:test-fixture-only@localhost/app");
  const client = await pool.connect();
  try {
    await client.query("SET ROLE vitamin_library_public");
    await assertPublicLibraryRole(client);
    assert.equal((await readPublishedSnapshot(client)).resources.length, 0);
    await assert.rejects(() => client.query("SELECT state FROM library_private.state"));
    await assert.rejects(() => client.query("SELECT password_hash FROM public.library_auth_user"));
    await assert.rejects(() => client.query("DELETE FROM library_public.snapshot"));
    await assert.rejects(() => client.query("CREATE TABLE public.public_role_must_not_write (id int)"));
    await client.query("RESET ROLE");
  } finally { client.release(); }
  await pool.query("GRANT SELECT ON public.library_auth_user TO vitamin_library_public");
  const tainted = await pool.connect();
  try {
    await tainted.query("SET ROLE vitamin_library_public");
    await assert.rejects(() => assertPublicLibraryRole(tainted), status(503));
    await tainted.query("RESET ROLE");
  } finally { tainted.release(); }

  console.log(`PASS: ${dbURL ? "isolated PostgreSQL" : "PGlite PostgreSQL"} migrations, 274-resource baseline, fixed owner, required/stale revisions, competing writes, private defaults, import/undo, publication allowlist, rollback, restore isolation, explicit empty snapshot and restricted public/auth SQL privileges.`);
} finally {
  // A caller-owned pg database is deliberately left intact for inspection and explicit disposal.
  if (db) await db.close(); else await pool.end();
}
