import { handleCloudLibraryAction } from "@/lib/cloud-library";
import { LibraryInputError } from "@/lib/library-domain";
import { getOwnerSession } from "@/lib/server/auth";
import { cloudLibraryEnabled } from "@/lib/server/config";
import { refreshPublicLibrary } from "@/lib/site-resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Vary": "Cookie",
};

function failure(error: string, status: number) {
  return Response.json({ error }, { status, headers: responseHeaders });
}

function unsupportedMethod() {
  return new Response(null, { status: cloudLibraryEnabled() ? 405 : 404, headers: responseHeaders });
}
export { unsupportedMethod as GET, unsupportedMethod as HEAD, unsupportedMethod as OPTIONS,
  unsupportedMethod as PUT, unsupportedMethod as PATCH, unsupportedMethod as DELETE };

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new LibraryInputError("请求内容不能超过 4 MB。", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new LibraryInputError("请求内容不能为空。");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new LibraryInputError("请求内容不能超过 4 MB。", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return value as Record<string, unknown>;
  } catch { throw new LibraryInputError("请求内容不是有效 JSON 对象。"); }
}

export async function POST(request: Request) {
  if (!cloudLibraryEnabled()) return new Response(null, { status: 404, headers: responseHeaders });
  try {
    // Trust the configured canonical origin, never a forwarded host or a body field.
    const expectedOrigin = new URL(process.env.BETTER_AUTH_URL || "").origin;
    if (request.headers.get("origin") !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
      return failure("请从本站管理页面操作。", 403);
    }
    const session = await getOwnerSession(request.headers);
    if (!session) return failure("登录已过期或此账号没有管理权限，请重新登录。", 401);
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return failure("请使用 JSON 请求。", 415);
    }
    const input = await jsonBody(request);
    if (input.action === "refresh-publication") {
      refreshPublicLibrary();
      return Response.json({ cacheStatus: "refreshed" }, { headers: responseHeaders });
    }
    const result = await handleCloudLibraryAction(input, session.user.id);
    if (input.action === "publish") {
      let cacheStatus: "refreshed" | "pending" = "refreshed";
      try { refreshPublicLibrary(); }
      catch { cacheStatus = "pending"; }
      return Response.json({ ...(result as Record<string, unknown>), cacheStatus }, { headers: responseHeaders });
    }
    return Response.json(result, { headers: responseHeaders });
  } catch (error) {
    return error instanceof LibraryInputError
      ? failure(error.message, error.status)
      : failure("资源库暂时不可用，尚未确认的操作请稍后重试。", 503);
  }
}
