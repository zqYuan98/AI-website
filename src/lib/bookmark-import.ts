import type { ImportCandidate } from "./resource-types";

export const MAX_BOOKMARK_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ITEMS = 5000;

/** Validate a saved destination without requesting it, including private HTTP(S) hosts. */
export function bookmarkUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u001f]/.test(value)) throw new Error("网址格式不正确。");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("请填写完整的 HTTP / HTTPS 网址。"); }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error("只支持不含账号密码的 HTTP / HTTPS 网址。");
  }
  return url.toString();
}

/** Conservative personal-bookmark identity: preserve host, path, query order, and fragment. */
export function canonicalBookmarkUrl(value: string): string {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
  return url.toString();
}

function decodeText(value: string): string {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? match;
    const point = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : "�";
  });
}

function plain(value: string): string {
  return decodeText(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  const start = tag.replace(/^<\s*[^\s>]+/, "").replace(/\/?\s*>$/, "");
  for (const match of start.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const key = match[1].toLowerCase();
    if (!(key in result)) result[key] = decodeText(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

export function validateImportCandidate(value: unknown): ImportCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("书签格式不正确。");
  const input = value as Record<string, unknown>;
  const url = bookmarkUrl(input.url);
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 120) throw new Error("书签名称需为 1–120 个字符。");
  if (input.sourceFolder !== undefined && (typeof input.sourceFolder !== "string" || input.sourceFolder.length > 1000)) throw new Error("书签文件夹名称过长。");
  let createdAt = "";
  if (input.createdAt !== undefined && input.createdAt !== "") {
    if (typeof input.createdAt !== "string" || input.createdAt.length > 40 || !Number.isFinite(Date.parse(input.createdAt))) throw new Error("书签时间格式不正确。");
    createdAt = new Date(input.createdAt).toISOString();
  }
  return { name: input.name.trim(), url, sourceFolder: typeof input.sourceFolder === "string" ? input.sourceFolder.trim() : "", createdAt };
}

/** Read Netscape bookmark HTML as tokens and text. It never creates a DOM or executes HTML. */
export function parseBookmarkHtml(html: unknown, existingUrls: string[] = []) {
  if (typeof html !== "string" || Buffer.byteLength(html, "utf8") > MAX_BOOKMARK_BYTES) throw new Error("书签 HTML 文件不能超过 2 MB。");
  const seen = new Set(existingUrls.map(canonicalBookmarkUrl));
  const items: ImportCandidate[] = [];
  const folders: string[] = [];
  let pendingFolder = "";
  let capture: { kind: "a" | "h3"; text: string; attrs: Record<string, string> } | null = null;
  let duplicates = 0;
  let invalid = 0;
  const invalidItems: { name: string; url: string; reason: string }[] = [];
  let count = 0;
  const input = html.replace(/<!--[\s\S]*?(?:-->|$)/g, "").replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "");

  const finish = () => {
    if (!capture) return;
    if (capture.kind === "h3") pendingFolder = plain(capture.text).slice(0, 160);
    else {
      if (++count > MAX_IMPORT_ITEMS) throw new Error("每次最多导入 5000 条书签，请拆分文件。");
      try {
        const url = bookmarkUrl(capture.attrs.href);
        const seconds = Number(capture.attrs.add_date);
        const timestamp = seconds > 0 && seconds < 8640000000000 ? new Date(seconds * 1000).toISOString() : "";
        const item = validateImportCandidate({ name: plain(capture.text).slice(0, 120) || new URL(url).hostname, url, sourceFolder: folders.filter(Boolean).join(" / "), createdAt: timestamp });
        const key = canonicalBookmarkUrl(item.url);
        if (seen.has(key)) duplicates++;
        else { seen.add(key); items.push(item); }
      } catch (error) {
        invalid++;
        if (invalidItems.length < 50) invalidItems.push({ name: plain(capture.text).slice(0, 120), url: String(capture.attrs.href ?? "").slice(0, 240), reason: error instanceof Error ? error.message : "书签格式不正确。" });
      }
    }
    capture = null;
  };

  for (const match of input.matchAll(/<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g)) {
    const token = match[0];
    if (!token.startsWith("<")) { if (capture) capture.text += token; continue; }
    const parsed = /^<\s*(\/?)\s*([a-z0-9]+)/i.exec(token);
    if (!parsed) continue;
    const closing = Boolean(parsed[1]);
    const tag = parsed[2].toLowerCase();
    if (tag === "a" || tag === "h3") {
      if (closing) { if (capture?.kind === tag) finish(); }
      else { finish(); capture = { kind: tag, text: "", attrs: attributes(token) }; }
    } else if (tag === "dl") {
      finish();
      if (closing) folders.pop();
      else { folders.push(pendingFolder); pendingFolder = ""; }
    }
  }
  finish();
  return { items, duplicates, invalid, invalidItems };
}
