import { isLocalManagementRequest } from "@/lib/local-tool-validation";
import { handleLibraryAction, LibraryInputError } from "@/lib/private-library";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function unsupportedMethod() {
  return new Response(null, { status: process.env.NODE_ENV === "development" ? 405 : 404, headers });
}

export { unsupportedMethod as GET, unsupportedMethod as HEAD, unsupportedMethod as OPTIONS,
  unsupportedMethod as PUT, unsupportedMethod as PATCH, unsupportedMethod as DELETE };

async function jsonBody(request: Request): Promise<unknown> {
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
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new LibraryInputError("请求内容不能超过 4 MB。", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new LibraryInputError("请求内容不是有效 JSON。"); }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404, headers });
  if (!isLocalManagementRequest(request, process.env.NODE_ENV)) return Response.json({ error: "只允许本机同源维护。" }, { status: 403, headers });
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return Response.json({ error: "请使用 JSON 请求。" }, { status: 415, headers });
  try {
    return Response.json(await handleLibraryAction(await jsonBody(request)), { headers });
  } catch (error) {
    const known = error instanceof LibraryInputError;
    return Response.json({ error: known ? error.message : "本地资源库读取或写入失败，请检查本地终端或备份。" }, { status: known ? error.status : 500, headers });
  }
}
