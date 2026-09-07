import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { LibraryInputError } from "../library-domain";
import { SMART_API_LIMITS, type ApiSettings } from "../smart-api-types";

export type KeyBinding = { ownerId: string; configId: string; version: string; baseUrl: string };
export type EncryptedKey = { algorithm: "aes-256-gcm"; iv: string; tag: string; ciphertext: string };
export type PublicAddress = { address: string; family: 4 | 6 };
export type AddressLookup = (hostname: string) => Promise<{ address: string; family: number }[]>;

function masterKey(value = process.env.LIBRARY_API_ENCRYPTION_KEY): Buffer {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new LibraryInputError("智能筛选加密密钥尚未正确配置。", 503);
  const result = Buffer.from(value, "base64");
  if (result.length !== 32 || result.toString("base64") !== value) throw new LibraryInputError("智能筛选加密密钥尚未正确配置。", 503);
  return result;
}

export function encryptionKeyReady(value = process.env.LIBRARY_API_ENCRYPTION_KEY): boolean {
  try { masterKey(value); return true; } catch { return false; }
}

function aad(binding: KeyBinding): Buffer {
  return Buffer.from(JSON.stringify(["smart-api-key:v1", binding.ownerId, binding.configId, binding.version, binding.baseUrl]));
}

export function validateApiKey(value: unknown): string {
  if (typeof value !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(value)) throw new LibraryInputError("API Key 不能为空、包含空白或超过 4096 字符。");
  return value;
}

export function encryptApiKey(value: string, binding: KeyBinding, key?: string): EncryptedKey {
  validateApiKey(value);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(key), iv);
  cipher.setAAD(aad(binding));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { algorithm: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}

export function decryptApiKey(envelope: EncryptedKey, binding: KeyBinding, key?: string): string {
  try {
    if (envelope.algorithm !== "aes-256-gcm") throw new Error("envelope");
    const iv = Buffer.from(envelope.iv, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    const ciphertext = Buffer.from(envelope.ciphertext, "base64");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1 || ciphertext.length > 4096) throw new Error("envelope");
    const decipher = createDecipheriv("aes-256-gcm", masterKey(key), iv);
    decipher.setAAD(aad(binding));
    decipher.setAuthTag(tag);
    return validateApiKey(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
  } catch { throw new LibraryInputError("保存的 API Key 暂时无法读取，请检查加密配置或重新填写。", 503); }
}

function ipv6Words(address: string): number[] | null {
  if (isIP(address) !== 6 || address.includes("%") || address.includes(".")) return null;
  const halves = address.toLowerCase().split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const words = halves.length === 1 ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  return words.length === 8 ? words.map(word => Number.parseInt(word, 16)) : null;
}

/** Conservative global-unicast allowlist. Special, mapped and transition ranges are excluded. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113)
      || address === "168.63.129.16");
  }
  const words = ipv6Words(address);
  if (!words || (words[0] & 0xe000) !== 0x2000) return false;
  return !((words[0] === 0x2001 && (words[1] < 0x0200 || words[1] === 0x0db8))
    || words[0] === 0x2002 || (words[0] === 0x3fff && words[1] < 0x1000));
}

function publicHostname(input: string): string | null {
  const hostname = input.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isIP(hostname)) return isPublicAddress(hostname) ? hostname : null;
  if (hostname.length > 253 || !hostname.includes(".") || !/^[a-z0-9.-]+$/.test(hostname)) return null;
  if (hostname.split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  if (/(^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|corp|test|invalid|onion|example|arpa)$/.test(hostname)) return null;
  if (/(^|\.)(?:metadata|instance-data)(\.|$)/.test(hostname)) return null;
  return hostname;
}

export function normalizeApiBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 2048 || /[\s?#]/.test(value.trim())) throw new LibraryInputError("Base URL 必须是无查询参数的公网 HTTPS 地址。");
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !publicHostname(url.hostname)) throw new Error("target");
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch { throw new LibraryInputError("Base URL 必须是无凭据、无查询参数的公网 HTTPS 地址。"); }
}

export function apiEndpoint(baseUrl: string): URL {
  return new URL(`${normalizeApiBaseUrl(baseUrl)}/chat/completions`);
}

/** No DNS or web fetch: filters obvious private links before the owner previews the outgoing title/domain. */
export function publicModelDomain(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const hostname = publicHostname(url.hostname);
    if (!hostname) return null;
    const path = decodeURIComponent(url.pathname).toLowerCase();
    if (/(^|\/)(?:admin|accounts?|settings|login|signin|sign-in|auth|dashboard|private|invite|billing|session)(?:\/|$)/.test(path)) return null;
    for (const name of url.searchParams.keys()) {
      if (/(?:token|secret|password|passwd|session|auth|api[-_]?key|access[-_]?key|signature|credential|email)/i.test(name)) return null;
    }
    return hostname;
  } catch { return null; }
}

export function isPublicModelDomain(value: string): boolean {
  if (typeof value !== "string" || /[\/?#@\s]/.test(value)) return false;
  return publicHostname(value) === value;
}

export async function resolvePublicTarget(baseUrl: string, resolve: AddressLookup = hostname => lookup(hostname, { all: true }), timeoutMs = 5000): Promise<PublicAddress> {
  const url = new URL(normalizeApiBaseUrl(baseUrl));
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return { address: hostname, family: isIP(hostname) as 4 | 6 };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      resolve(hostname),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new LibraryInputError("模型服务域名解析超时。", 502)), timeoutMs); }),
    ]);
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address) || item.family !== isIP(item.address))) throw new LibraryInputError("模型服务域名指向了不允许访问的地址。");
    const address = addresses[0].family === 6 ? new URL(`https://[${addresses[0].address}]`).hostname.slice(1, -1) : addresses[0].address;
    return { address, family: addresses[0].family as 4 | 6 };
  } catch (error) {
    if (error instanceof LibraryInputError) throw error;
    throw new LibraryInputError("模型服务域名暂时无法解析。", 502);
  } finally { if (timer) clearTimeout(timer); }
}

export function normalizeApiSettings(value: unknown): ApiSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LibraryInputError("智能筛选设置格式不正确。");
  const input = value as Record<string, unknown>;
  function text(field: string, max: number) {
    const item = input[field];
    if (typeof item !== "string" || !item.trim() || item.trim().length > max || /[\x00-\x1f\x7f]/.test(item)) throw new LibraryInputError("连接名称或模型 ID 不正确。");
    return item.trim();
  }
  function cap(field: keyof typeof SMART_API_LIMITS) {
    const item = input[field];
    const { min, max } = SMART_API_LIMITS[field];
    if (typeof item !== "number" || !Number.isInteger(item) || item < min || item > max) throw new LibraryInputError("分析条数、并发或请求上限超出允许范围。");
    return item;
  }
  function money(field: string) {
    const item = input[field];
    if (item === null || item === undefined) return null;
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 1_000_000) throw new LibraryInputError("价格或估算预算必须是有效的非负数字。");
    return item;
  }
  const inputPricePerMillion = money("inputPricePerMillion");
  const outputPricePerMillion = money("outputPricePerMillion");
  const estimatedBudget = money("estimatedBudget");
  if (estimatedBudget !== null && (estimatedBudget <= 0 || inputPricePerMillion === null || outputPricePerMillion === null)) throw new LibraryInputError("估算预算需要先填写输入与输出单价，且预算应大于零。");
  return { name: text("name", 80), baseUrl: normalizeApiBaseUrl(input.baseUrl), model: text("model", 160), batchSize: cap("batchSize"), maxRequests: cap("maxRequests"), concurrency: cap("concurrency"), maxOutputTokens: cap("maxOutputTokens"), inputPricePerMillion, outputPricePerMillion, estimatedBudget };
}
