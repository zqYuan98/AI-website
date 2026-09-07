import "server-only";

import { LibraryInputError } from "@/lib/library-domain";
import { getOwnerSession } from "./auth";
import { cloudLibraryEnabled } from "./config";

export const PRIVATE_API_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export function privateApiFailure(error: string, status: number) {
  return Response.json({ error }, { status, headers: PRIVATE_API_HEADERS });
}

export function privateUnsupportedMethod() {
  return new Response(null, { status: cloudLibraryEnabled() ? 405 : 404, headers: PRIVATE_API_HEADERS });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new LibraryInputError("本次请求超过 4 MB，请减少条目后再试。", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new LibraryInputError("请求内容不能为空。");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new LibraryInputError("本次请求超过 4 MB，请减少条目后再试。", 413);
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

/** All private features share the canonical-origin and owner boundary; no endpoint accepts a caller-supplied owner. */
export function ownerJsonPost(handle: (input: Record<string, unknown>, ownerId: string) => Promise<unknown>) {
  return async function POST(request: Request) {
    if (!cloudLibraryEnabled()) return new Response(null, { status: 404, headers: PRIVATE_API_HEADERS });
    try {
      const origin = new URL(process.env.BETTER_AUTH_URL || "").origin;
      if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") {
        return privateApiFailure("请从本站管理页面操作。", 403);
      }
      const session = await getOwnerSession(request.headers);
      if (!session) return privateApiFailure("登录已过期或此账号没有管理权限，请重新登录。", 401);
      if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
        return privateApiFailure("请使用 JSON 请求。", 415);
      }
      const result = await handle(await readBody(request), session.user.id);
      return Response.json(result, { headers: PRIVATE_API_HEADERS });
    } catch (error) {
      return error instanceof LibraryInputError
        ? privateApiFailure(error.message, error.status)
        : privateApiFailure("操作暂时无法完成，已保存的进度会保留，请稍后重试。", 503);
    }
  };
}
