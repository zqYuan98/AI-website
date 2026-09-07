import "server-only";

import { createHash } from "node:crypto";
import { getDatabasePool } from "./server/database";
import { applyLibraryAction, LIBRARY_MUTATIONS, libraryObject, LibraryInputError, libraryFromPublished, normalizeLibraryState, normalizePublicSnapshot, restoredLibrary } from "./library-domain";
import { canonicalBookmarkUrl } from "./bookmark-import";
import type { LibraryState, PublicLibrarySnapshot } from "./resource-types";

type QueryResult = { rows: Record<string, unknown>[] };
export type LibraryConnection = { query(sql: string, values?: unknown[]): Promise<QueryResult>; release(): void };
export type LibraryPool = { connect(): Promise<LibraryConnection>; query(sql: string, values?: unknown[]): Promise<QueryResult> };

function expectedOwner(): string {
  const owner = process.env.LIBRARY_OWNER_ID?.trim();
  if (!owner || owner.length > 128) throw new LibraryInputError("线上资源库尚未完成配置。", 503);
  return owner;
}

function assertRevision(value: unknown, actual: string) {
  if (value === undefined) throw new LibraryInputError("缺少资源库版本，请刷新列表后重试。", 428);
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || value !== actual) throw new LibraryInputError("资源库已在其他页面更新；请保留当前输入，刷新列表后核对再保存。", 409);
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Injectable SQL boundary lets tests execute the same transactions against an isolated PostgreSQL engine. */
export function createCloudLibraryStore(pool: LibraryPool, owner: () => string = expectedOwner) {
  function authorize(ownerId: string) {
    if (!ownerId || ownerId !== owner()) throw new LibraryInputError("无权访问此资源库。", 403);
  }

  async function transaction<T>(work: (client: LibraryConnection) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Do not expose driver or connection details. */ }
      throw error;
    } finally { client.release(); }
  }

  async function read(client: LibraryConnection, ownerId: string) {
    // Serialize reads with mutations too, so every response pairs one draft revision with its publication.
    const result = await client.query("SELECT owner_id, state, revision::text AS revision FROM library_private.state WHERE singleton = true FOR UPDATE");
    const row = result.rows[0];
    if (!row) throw new LibraryInputError("线上资源库尚未初始化，请由站点所有者完成迁移。", 503);
    authorize(ownerId);
    if (row.owner_id !== ownerId) throw new LibraryInputError("无权访问此资源库。", 403);
    const publication = await client.query("SELECT snapshot FROM library_public.snapshot WHERE singleton = true");
    if (!publication.rows[0]) throw new LibraryInputError("公开快照尚未初始化。", 503);
    return { state: normalizeLibraryState(row.state), snapshot: normalizePublicSnapshot(publication.rows[0].snapshot), revision: String(row.revision) };
  }

  async function persist(client: LibraryConnection, ownerId: string, state: LibraryState) {
    const result = await client.query("UPDATE library_private.state SET state = $1::jsonb, revision = revision + 1, updated_at = now() WHERE singleton = true AND owner_id = $2 RETURNING revision::text AS revision", [JSON.stringify(state), ownerId]);
    if (!result.rows[0]) throw new LibraryInputError("无权访问此资源库。", 403);
    return String(result.rows[0].revision);
  }

  async function handle(value: unknown, ownerId: string) {
    authorize(ownerId);
    const input = libraryObject(value);
    return transaction(async client => {
      const current = await read(client, ownerId);
      if (LIBRARY_MUTATIONS.has(String(input.action))) assertRevision(input.libraryRevision, current.revision);
      const transition = applyLibraryAction(current.state, input, current.snapshot);
      let revision = current.revision;
      if (transition.changed) revision = await persist(client, ownerId, transition.state);
      if (transition.publishedSnapshot) {
        const published = await client.query("UPDATE library_public.snapshot SET snapshot = $1::jsonb WHERE singleton = true RETURNING singleton", [JSON.stringify(transition.publishedSnapshot)]);
        if (!published.rows[0]) throw new LibraryInputError("公开快照尚未初始化。", 503);
      }
      return { ...transition.result, libraryRevision: revision, publishedIds: (transition.publishedSnapshot ?? current.snapshot).resources.map(resource => resource.id) };
    });
  }

  async function initializationPreview(snapshot: unknown, ownerId: string) {
    authorize(ownerId);
    const publication = normalizePublicSnapshot(snapshot);
    return transaction(async client => {
      // This lock also covers the absence of a row during first initialization.
      await client.query("LOCK TABLE library_private.state, library_public.snapshot IN EXCLUSIVE MODE");
      const row = (await client.query("SELECT owner_id FROM library_private.state WHERE singleton = true")).rows[0];
      const published = (await client.query("SELECT singleton FROM library_public.snapshot WHERE singleton = true")).rows[0];
      if (row && row.owner_id !== ownerId) throw new LibraryInputError("无权访问此资源库。", 403);
      if (Boolean(row) !== Boolean(published)) throw new LibraryInputError("数据库存在不完整初始化，请先检查迁移状态。", 409);
      return { initialized: Boolean(row), count: publication.resources.length, confirmation: digest({ ownerId, publication, initialized: Boolean(row) }) };
    });
  }

  async function initialize(snapshot: unknown, ownerId: string, confirmation: unknown) {
    authorize(ownerId);
    const publication = normalizePublicSnapshot(snapshot);
    return transaction(async client => {
      await client.query("LOCK TABLE library_private.state, library_public.snapshot IN EXCLUSIVE MODE");
      const row = (await client.query("SELECT owner_id FROM library_private.state WHERE singleton = true")).rows[0];
      const published = (await client.query("SELECT singleton FROM library_public.snapshot WHERE singleton = true")).rows[0];
      if (row && row.owner_id !== ownerId) throw new LibraryInputError("无权访问此资源库。", 403);
      if (Boolean(row) !== Boolean(published)) throw new LibraryInputError("数据库存在不完整初始化，请先检查迁移状态。", 409);
      if (confirmation !== digest({ ownerId, publication, initialized: Boolean(row) })) throw new LibraryInputError("迁移预览已变化，请重新预览。", 409);
      if (row) return { initialized: true, changed: false };
      await client.query("INSERT INTO library_private.state (owner_id, state) VALUES ($1, $2::jsonb)", [ownerId, JSON.stringify(libraryFromPublished(publication))]);
      await client.query("INSERT INTO library_public.snapshot (snapshot) VALUES ($1::jsonb)", [JSON.stringify(publication)]);
      return { initialized: true, changed: true, count: publication.resources.length, libraryRevision: "1" };
    });
  }

  function restorationPlan(state: LibraryState, snapshot: PublicLibrarySnapshot, backup: unknown, revision: string, ownerId: string) {
    const restored = restoredLibrary(backup, snapshot);
    const byId = new Map(state.resources.map(resource => [resource.id, resource]));
    const byUrl = new Map(state.resources.map(resource => [canonicalBookmarkUrl(resource.url), resource.id]));
    const idConflicts = restored.resources.filter(resource => byId.has(resource.id) && JSON.stringify(byId.get(resource.id)) !== JSON.stringify(resource)).map(resource => resource.id);
    const urlConflicts = restored.resources.filter(resource => byUrl.has(canonicalBookmarkUrl(resource.url)) && byUrl.get(canonicalBookmarkUrl(resource.url)) !== resource.id).map(resource => resource.id);
    const restoredIds = new Set(restored.resources.map(resource => resource.id));
    const removedIds = state.resources.filter(resource => !restoredIds.has(resource.id)).map(resource => resource.id);
    return { restored, summary: { mode: "replace-private-draft", currentCount: state.resources.length, restoredCount: restored.resources.length, idConflicts, urlConflicts, removedIds, publishedCount: snapshot.resources.length, libraryRevision: revision, confirmation: digest({ ownerId, revision, restored, snapshot }) } };
  }

  async function restorePreview(backup: unknown, ownerId: string) {
    authorize(ownerId);
    return transaction(async client => {
      const current = await read(client, ownerId);
      return restorationPlan(current.state, current.snapshot, backup, current.revision, ownerId).summary;
    });
  }

  async function restore(backup: unknown, ownerId: string, libraryRevision: unknown, confirmation: unknown) {
    authorize(ownerId);
    return transaction(async client => {
      const current = await read(client, ownerId);
      assertRevision(libraryRevision, current.revision);
      const plan = restorationPlan(current.state, current.snapshot, backup, current.revision, ownerId);
      if (confirmation !== plan.summary.confirmation) throw new LibraryInputError("备份或恢复预览已变化，请重新预览。", 409);
      const revision = await persist(client, ownerId, plan.restored);
      return { restored: plan.restored.resources.length, libraryRevision: revision, publishedIds: current.snapshot.resources.map(resource => resource.id) };
    });
  }

  return { handle, initializationPreview, initialize, restorePreview, restore };
}

export async function handleCloudLibraryAction(input: unknown, ownerId: string) {
  if (process.env.RESOURCE_LIBRARY_MODE !== "cloud") throw new LibraryInputError("线上资源库尚未启用。", 404);
  return createCloudLibraryStore(getDatabasePool()).handle(input, ownerId);
}

export { readCloudPublicSnapshot } from "./cloud-publication";
