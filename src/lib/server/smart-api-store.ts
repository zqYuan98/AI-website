import "server-only";

import { randomUUID } from "node:crypto";
import type { LibraryConnection, LibraryPool } from "../cloud-library";
import { LibraryInputError } from "../library-domain";
import { SMART_API_DEFAULT_SETTINGS, type ApiConfigView, type ApiTestResult, type ModelUsage, type ApprovedModelInput } from "../smart-api-types";
import { getDatabasePool } from "./database";
import { modelRequestBody, postChatCompletion, SmartApiCallError, type ModelCompletion, type ResolvedApiConfig } from "./smart-api-client";
import { decryptApiKey, encryptApiKey, encryptionKeyReady, normalizeApiSettings, validateApiKey, type EncryptedKey } from "./smart-api-security";

export type ApiTestRequest = {
  requestId: string; configId: string; configVersion: string; purpose: "connection-test";
  inputBytes: number; maxOutputTokens: number;
};
export type ApiTestOutcome = { success: boolean; usage: ModelUsage | null; outcome: "success" | "unknown" | "rejected" | "invalid_response" | "not_sent" };
export type ApiTestHooks = {
  beforeSend?: (request: ApiTestRequest) => Promise<void>;
  afterResult?: (request: ApiTestRequest, outcome: ApiTestOutcome) => Promise<void>;
};
export type ApiStoreDependencies = {
  encryptionKey?: () => string | undefined;
  now?: () => Date;
  complete?: (config: ResolvedApiConfig, inputs: ApprovedModelInput[], beforeSend?: () => Promise<void>) => Promise<ModelCompletion>;
};

const CONFIG_ID = "primary";
const TEST_INTERVAL_MS = 30_000;
const TEST_LEASE_MS = 60_000;
const TEST_ITEMS: ApprovedModelInput[] = [{ id: "connection-test", title: "Fictional note organizer — imaginary example for connection testing", domain: "example.com" }];
type Row = Record<string, unknown>;

function expectedOwner(): string {
  const owner = process.env.LIBRARY_OWNER_ID?.trim();
  if (!owner || owner.length > 128) throw new LibraryInputError("智能筛选尚未完成所有者配置。", 503);
  return owner;
}

function version(value: unknown, actual: string): void {
  if (value === undefined) throw new LibraryInputError("缺少配置版本，请刷新设置后重试。", 428);
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,18})$/.test(value) || value !== actual) throw new LibraryInputError("模型配置已在其他页面更新，请重新查看设置。", 409);
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

/** Uses the private SQL boundary; external network work never holds a transaction open. */
export function createApiConfigStore(pool: LibraryPool, owner: () => string = expectedOwner, deps: ApiStoreDependencies = {}) {
  const key = deps.encryptionKey ?? (() => process.env.LIBRARY_API_ENCRYPTION_KEY);
  const now = deps.now ?? (() => new Date());
  const complete = deps.complete ?? ((config, inputs, beforeSend) => postChatCompletion(config, inputs, { beforeSend }));

  function authorize(ownerId: string, row?: Row) {
    if (!ownerId || ownerId !== owner() || (row && row.owner_id !== ownerId)) throw new LibraryInputError("无权访问智能筛选设置。", 403);
  }

  async function transaction<T>(work: (client: LibraryConnection) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* No driver diagnostics can enter the public response. */ }
      throw error;
    } finally { client.release(); }
  }

  async function row(client: Pick<LibraryConnection, "query">, ownerId: string, lock = false): Promise<Row | undefined> {
    authorize(ownerId);
    const result = await client.query(`SELECT owner_id, config_id, version::text AS version, settings, encrypted_key, enabled, tested_version::text AS tested_version, tested_at, updated_at, last_test_started_at, test_active_until, test_claim_id FROM library_private.smart_api_settings WHERE singleton = true${lock ? " FOR UPDATE" : ""}`);
    const found = result.rows[0];
    if (found) authorize(ownerId, found);
    return found;
  }

  async function lockOwner(client: LibraryConnection, ownerId: string) {
    authorize(ownerId);
    // Shared ordering with analysis: owner state, then job/settings. Empty standalone fixtures are allowed.
    const found = (await client.query("SELECT owner_id FROM library_private.state WHERE singleton = true FOR UPDATE")).rows[0];
    if (found) authorize(ownerId, found);
  }

  async function pauseAnalysis(client: LibraryConnection, ownerId: string) {
    const available = (await client.query("SELECT to_regclass('library_private.analysis_jobs') AS table_name")).rows[0]?.table_name;
    if (!available) return;
    await client.query("UPDATE library_private.analysis_jobs SET state = state || jsonb_build_object('status', 'paused', 'message', $1::text), revision = revision + 1, updated_at = $2 WHERE owner_id = $3 AND state->>'status' IN ('queued', 'running')", ["模型配置已修改或停用，请重新确认服务与发送范围后继续。", now().toISOString(), ownerId]);
  }

  async function assertTestCapacity(client: LibraryConnection, ownerId: string, concurrency: number) {
    const available = (await client.query("SELECT to_regclass('library_private.analysis_requests') AS table_name")).rows[0]?.table_name;
    if (!available) return;
    const result = await client.query("SELECT count(*)::int AS count FROM library_private.analysis_requests WHERE owner_id = $1 AND status IN ('reserved', 'sent') AND lease_until > $2", [ownerId, now().toISOString()]);
    if (Number(result.rows[0]?.count) >= concurrency) throw new LibraryInputError("模型分析已占用并发额度，请稍后测试连接。", 429);
  }

  function view(found?: Row): ApiConfigView {
    return {
      id: CONFIG_ID, version: found ? String(found.version) : "0", testedVersion: found?.tested_version == null ? null : String(found.tested_version),
      enabled: Boolean(found?.enabled), hasKey: Boolean(found?.encrypted_key), encryptionReady: encryptionKeyReady(key()),
      settings: found ? normalizeApiSettings(found.settings) : { ...SMART_API_DEFAULT_SETTINGS },
      testedAt: iso(found?.tested_at), updatedAt: iso(found?.updated_at),
    };
  }

  function resolveRow(found: Row, ownerId: string): ResolvedApiConfig {
    const config = view(found);
    if (!found.encrypted_key) throw new LibraryInputError("请先填写并保存 API Key。", 409);
    return { id: config.id, version: config.version, settings: config.settings, apiKey: decryptApiKey(found.encrypted_key as EncryptedKey, { ownerId, configId: config.id, version: config.version, baseUrl: config.settings.baseUrl }, key()) };
  }

  async function read(ownerId: string): Promise<ApiConfigView> { return view(await row(pool, ownerId)); }

  async function save(ownerId: string, value: unknown): Promise<ApiConfigView> {
    authorize(ownerId);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new LibraryInputError("智能筛选设置格式不正确。");
    const input = value as Record<string, unknown>;
    const settings = normalizeApiSettings(input.settings);
    const replacement = input.apiKey === undefined ? undefined : validateApiKey(input.apiKey);
    return transaction(async client => {
      await lockOwner(client, ownerId);
      const current = await row(client, ownerId, true);
      version(input.version, current ? String(current.version) : "0");
      // Re-saving identical settings must not invalidate an already tested and enabled service.
      // Keep this after owner/version checks; an explicitly supplied key is always a replacement.
      if (current && replacement === undefined && JSON.stringify(normalizeApiSettings(current.settings)) === JSON.stringify(settings)) return view(current);
      const nextVersion = current ? String(BigInt(String(current.version)) + BigInt(1)) : "1";
      let plaintext = replacement;
      if (plaintext === undefined && current?.encrypted_key && normalizeApiSettings(current.settings).baseUrl === settings.baseUrl) plaintext = resolveRow(current, ownerId).apiKey;
      const encrypted = plaintext === undefined ? null : encryptApiKey(plaintext, { ownerId, configId: CONFIG_ID, version: nextVersion, baseUrl: settings.baseUrl }, key());
      const updatedAt = now().toISOString();
      if (!current) {
        const inserted = await client.query("INSERT INTO library_private.smart_api_settings (owner_id, settings, encrypted_key, updated_at) VALUES ($1, $2::jsonb, $3::jsonb, $4) ON CONFLICT (singleton) DO NOTHING RETURNING config_id", [ownerId, JSON.stringify(settings), encrypted ? JSON.stringify(encrypted) : null, updatedAt]);
        if (!inserted.rows[0]) throw new LibraryInputError("模型配置已在其他页面创建，请重新查看设置。", 409);
      } else {
        // Preserve test throttle/lease across edits; changing a URL cannot bypass the test rate limit.
        await client.query("UPDATE library_private.smart_api_settings SET version = $1, settings = $2::jsonb, encrypted_key = $3::jsonb, enabled = false, tested_version = NULL, tested_at = NULL, updated_at = $4 WHERE singleton = true AND owner_id = $5", [nextVersion, JSON.stringify(settings), encrypted ? JSON.stringify(encrypted) : null, updatedAt, ownerId]);
      }
      await pauseAnalysis(client, ownerId);
      return view(await row(client, ownerId));
    });
  }

  async function assertCurrent(client: LibraryConnection, ownerId: string, expectedVersion: unknown): Promise<ApiConfigView> {
    const current = await row(client, ownerId, true);
    version(expectedVersion, current ? String(current.version) : "0");
    if (!current || !current.enabled || !current.encrypted_key || String(current.tested_version) !== String(current.version)) throw new LibraryInputError("模型配置已停用、修改或尚未通过测试，请重新确认分析。", 409);
    return view(current);
  }

  async function resolve(ownerId: string, expectedVersion: unknown): Promise<ResolvedApiConfig> {
    return transaction(async client => {
      await assertCurrent(client, ownerId, expectedVersion);
      const current = await row(client, ownerId);
      return resolveRow(current!, ownerId);
    });
  }

  async function setEnabled(ownerId: string, expectedVersion: unknown, enabled: unknown): Promise<ApiConfigView> {
    authorize(ownerId);
    if (typeof enabled !== "boolean") throw new LibraryInputError("启用开关格式不正确。");
    return transaction(async client => {
      await lockOwner(client, ownerId);
      const current = await row(client, ownerId, true);
      version(expectedVersion, current ? String(current.version) : "0");
      if (!current) throw new LibraryInputError("请先保存模型配置。", 409);
      if (enabled && (!current.encrypted_key || String(current.tested_version) !== String(current.version) || !encryptionKeyReady(key()))) throw new LibraryInputError("请先为当前配置保存 Key 并通过连接测试。", 409);
      await client.query("UPDATE library_private.smart_api_settings SET enabled = $1, updated_at = $2 WHERE singleton = true AND owner_id = $3", [enabled, now().toISOString(), ownerId]);
      if (!enabled) await pauseAnalysis(client, ownerId);
      return view(await row(client, ownerId));
    });
  }

  async function clearKey(ownerId: string, expectedVersion: unknown): Promise<ApiConfigView> {
    return transaction(async client => {
      await lockOwner(client, ownerId);
      const current = await row(client, ownerId, true);
      version(expectedVersion, current ? String(current.version) : "0");
      if (!current) return view();
      await client.query("UPDATE library_private.smart_api_settings SET version = version + 1, encrypted_key = NULL, enabled = false, tested_version = NULL, tested_at = NULL, updated_at = $1 WHERE singleton = true AND owner_id = $2", [now().toISOString(), ownerId]);
      await pauseAnalysis(client, ownerId);
      return view(await row(client, ownerId));
    });
  }

  async function test(ownerId: string, expectedVersion: unknown, hooks: ApiTestHooks = {}): Promise<ApiTestResult> {
    const requestId = randomUUID();
    const config = await transaction(async client => {
      await lockOwner(client, ownerId);
      const current = await row(client, ownerId, true);
      version(expectedVersion, current ? String(current.version) : "0");
      if (!current) throw new LibraryInputError("请先保存模型配置。", 409);
      const resolved = resolveRow(current, ownerId);
      const started = now();
      const last = iso(current.last_test_started_at);
      const active = iso(current.test_active_until);
      if ((last && started.getTime() - Date.parse(last) < TEST_INTERVAL_MS) || (active && Date.parse(active) > started.getTime())) throw new LibraryInputError("连接测试正在进行或操作过于频繁，请稍后再试。", 429);
      await assertTestCapacity(client, ownerId, resolved.settings.concurrency);
      await client.query("UPDATE library_private.smart_api_settings SET last_test_started_at = $1, test_active_until = $2, test_claim_id = $3 WHERE singleton = true AND owner_id = $4", [started.toISOString(), new Date(started.getTime() + TEST_LEASE_MS).toISOString(), requestId, ownerId]);
      return { ...resolved, settings: { ...resolved.settings, maxOutputTokens: Math.min(resolved.settings.maxOutputTokens, 1024) } };
    });
    const metadata: ApiTestRequest = { requestId, configId: config.id, configVersion: config.version, purpose: "connection-test", inputBytes: Buffer.byteLength(modelRequestBody(config, TEST_ITEMS)), maxOutputTokens: config.settings.maxOutputTokens };
    let sent = false;
    let result: ModelCompletion | undefined;
    let failure: unknown;
    async function authorizeSending() {
      await transaction(async client => {
        await lockOwner(client, ownerId);
        const current = await row(client, ownerId, true);
        version(config.version, current ? String(current.version) : "0");
        if (!current?.encrypted_key || current.test_claim_id !== requestId || !iso(current.test_active_until) || Date.parse(iso(current.test_active_until)!) <= now().getTime()) throw new LibraryInputError("测试配置或执行状态已变化，请重新测试。", 409);
      });
      sent = true;
    }
    try {
      // Deliberately outside the settings transaction: root ledger hooks can take their own locks.
      await hooks.beforeSend?.(metadata);
      result = await complete(config, TEST_ITEMS.map(item => ({ ...item })), authorizeSending);
    } catch (error) { failure = error; }
    if (sent) {
      try {
        await hooks.afterResult?.(metadata, { success: Boolean(result), usage: result?.usage ?? null, outcome: result ? "success" : failure instanceof SmartApiCallError ? failure.outcome : "unknown" });
      } catch { failure = new LibraryInputError("连接结果已返回，但用量记录未完成，请稍后查看设置。", 503); result = undefined; }
    }
    const saved = await transaction(async client => {
      await lockOwner(client, ownerId);
      const current = await row(client, ownerId, true);
      if (!current || current.test_claim_id !== requestId) throw new LibraryInputError("测试状态已变化，请重新查看配置。", 409);
      const sameVersion = String(current.version) === config.version;
      if (sameVersion && result) {
        await client.query("UPDATE library_private.smart_api_settings SET tested_version = version, tested_at = $1, test_active_until = NULL, test_claim_id = NULL WHERE singleton = true AND owner_id = $2", [now().toISOString(), ownerId]);
      } else if (sameVersion && sent) {
        await client.query("UPDATE library_private.smart_api_settings SET enabled = false, tested_version = NULL, tested_at = NULL, test_active_until = NULL, test_claim_id = NULL WHERE singleton = true AND owner_id = $1", [ownerId]);
        await pauseAnalysis(client, ownerId);
      } else {
        await client.query("UPDATE library_private.smart_api_settings SET test_active_until = NULL, test_claim_id = NULL WHERE singleton = true AND owner_id = $1", [ownerId]);
      }
      return { sameVersion, config: view(await row(client, ownerId)) };
    });
    if (!saved.sameVersion) throw new LibraryInputError("测试期间模型配置已变化，请为新版本重新测试。", 409);
    if (failure || !result) {
      if (failure instanceof LibraryInputError) throw failure;
      throw new LibraryInputError("连接测试未能完成，请检查服务配置后重试。", 502);
    }
    return { config: saved.config, success: true, requestId, usage: result.usage };
  }

  return { read, save, test, setEnabled, clearKey, resolve, assertCurrent };
}

export function getApiConfigStore() { return createApiConfigStore(getDatabasePool()); }
