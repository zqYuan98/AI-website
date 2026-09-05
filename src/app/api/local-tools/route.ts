import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getAllTools } from "@/lib/curation";
import { isLocalManagementRequest, validateLocalToolInput } from "@/lib/local-tool-validation";
import { canonicalToolUrl } from "@/lib/tool-url";

export const runtime = "nodejs";

function unsupportedMethod() {
  return new Response(null, {
    status: process.env.NODE_ENV === "development" ? 405 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export { unsupportedMethod as GET, unsupportedMethod as HEAD, unsupportedMethod as OPTIONS,
  unsupportedMethod as PUT, unsupportedMethod as PATCH, unsupportedMethod as DELETE };

async function boundedBody(response: Response | Request, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new Error("内容超过大小限制。"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

/** Fetch only the fixed favicon service, never a submitted URL or an arbitrary redirect. */
async function getFavicon(domain: string): Promise<Uint8Array | null> {
  let target = new URL("https://www.google.com/s2/favicons");
  target.searchParams.set("domain", domain);
  target.searchParams.set("sz", "64");
  const signal = AbortSignal.timeout(6000);
  try {
    for (let hop = 0; hop < 4; hop++) {
      if (target.protocol !== "https:" || !(target.hostname === "www.google.com" || /^t[0-3]\.gstatic\.com$/.test(target.hostname))) return null;
      const response = await fetch(target, { signal, redirect: "manual", cache: "no-store", credentials: "omit" });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) return null;
        target = new URL(location, target);
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); return null; }
      const bytes = Buffer.from(await boundedBody(response, 262144));
      if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
      if (bytes.readUInt32BE(16) > 512 || bytes.readUInt32BE(20) > 512) return null;
      return bytes;
    }
  } catch { /* An unavailable icon must not prevent saving a tool. */ }
  return null;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  if (!isLocalManagementRequest(request, process.env.NODE_ENV)) return Response.json({ error: "只允许本机同源维护。" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "请使用 JSON 表单。" }, { status: 415 });
  try {
    const data = validateLocalToolInput(JSON.parse(new TextDecoder().decode(await boundedBody(request, 16384))));
    const duplicate = getAllTools().find(tool => canonicalToolUrl(tool.url) === canonicalToolUrl(data.url));
    if (duplicate) return Response.json({ error: `这个网址已收藏为「${duplicate.name}」。`, existingName: duplicate.name }, { status: 409 });
    const slug = `custom-${randomUUID()}`;
    const favicon = await getFavicon(new URL(data.url).hostname);

    // Recheck after the network wait; the following synchronous write is one local transaction.
    if (getAllTools().some(tool => canonicalToolUrl(tool.url) === canonicalToolUrl(data.url))) {
      return Response.json({ error: "这个网址刚刚已被添加，请返回工具箱查看。" }, { status: 409 });
    }
    const filename = path.join(process.cwd(), "content", "tool-custom.json");
    const collection = fs.existsSync(filename)
      ? JSON.parse(fs.readFileSync(filename, "utf8"))
      : { source: { name: "手动收藏", importedAt: "" }, tools: [] };
    collection.source.importedAt = new Date().toISOString().slice(0, 10);
    const icon = favicon ? `/images/tools/icons/${slug}.png` : "";
    const iconFile = icon ? path.join(process.cwd(), "public", icon) : "";
    const temporaryFile = `${filename}.${randomUUID()}.tmp`;
    try {
      if (favicon && iconFile) {
        fs.mkdirSync(path.dirname(iconFile), { recursive: true });
        fs.writeFileSync(iconFile, favicon, { flag: "wx" });
      }
      collection.tools.push({ slug, ...data, icon, sourceCategories: [], linkStatus: "unchecked" });
      fs.writeFileSync(temporaryFile, `${JSON.stringify(collection, null, 2)}\n`, { flag: "wx" });
      fs.renameSync(temporaryFile, filename);
    } catch (error) {
      if (iconFile && fs.existsSync(iconFile)) fs.unlinkSync(iconFile);
      throw error;
    } finally {
      if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
    }
    return Response.json({ name: data.name, slug, iconSaved: Boolean(icon), message: "已保存到项目。部署后会在公开网站显示。" }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof SyntaxError ? "表单内容不是有效 JSON。" : error instanceof Error ? error.message : "保存失败。";
    // Do not expose filesystem paths or stack traces in error responses.
    return Response.json({ error: /ENOENT|EACCES|EPERM|EEXIST|curation/.test(message) ? "项目内容校验或写入失败，请检查本地终端。" : message }, { status: 400 });
  }
}
