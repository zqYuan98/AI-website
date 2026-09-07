import { getAuth } from "@/lib/server/auth";
import { cloudLibraryEnabled, getCloudAuthConfig } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store, max-age=0", "Pragma": "no-cache", "Vary": "Cookie, Origin" };
const fail = (status: number, message: string) => Response.json({ error: message, message }, { status, headers: NO_STORE });

function hasCanonicalHost(request: Request, url: URL, canonical: URL): boolean {
  // Next.js can normalize the internal URL behind a proxy. Only Host identifies
  // the requested authority; forwarded headers cannot override this check.
  const host = request.headers.get("host") ?? url.host;
  if (!/^(?:[a-z0-9.-]+|\[[a-f0-9:.]+\])(?::[0-9]{1,5})?$/i.test(host)) return false;
  try {
    return new URL(`${canonical.protocol}//${host}`).host === canonical.host;
  } catch { return false; }
}

/** Only the three browser operations needed by the single-owner application exist. */
async function handle(request: Request) {
  if (!cloudLibraryEnabled()) return fail(404, "未找到页面。");
  try {
    const config = getCloudAuthConfig();
    const url = new URL(request.url);
    const canonical = new URL(config.baseURL);
    const path = url.pathname;
    const allowed = request.method === "GET" ? path === "/api/auth/get-session" : request.method === "POST" && ["/api/auth/sign-in/email", "/api/auth/sign-out"].includes(path);
    if (!allowed) return fail(404, "未找到页面。");
    if (!hasCanonicalHost(request, url, canonical) || request.headers.get("sec-fetch-site") === "cross-site" || (request.method === "POST" && request.headers.get("origin") !== canonical.origin)) return fail(403, "请从本站页面重新操作。");
    if (request.method === "POST") {
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return fail(415, "请求格式不正确。");
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) { await reader.cancel(); return fail(413, "请求内容过长。"); }
        chunks.push(value);
      }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return fail(400, "请求格式不正确。"); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "请求格式不正确。");
      request = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) });
    }
    // Always use the actual handler so persisted rate limits and Better Auth's CSRF checks run.
    const response = await getAuth().handler(request);
    const headers = new Headers(response.headers);
    Object.entries(NO_STORE).forEach(([name, value]) => headers.set(name, value));
    if (!response.ok) {
      if (response.status === 429) return Response.json({ error: "尝试次数过多，请稍后再试。", message: "尝试次数过多，请稍后再试。" }, { status: 429, headers });
      const status = response.status >= 500 ? 503 : 401;
      return Response.json({ error: status === 503 ? "登录服务暂不可用，请稍后重试。" : "邮箱或密码不正确，或账号无管理权限。", message: status === 503 ? "登录服务暂不可用，请稍后重试。" : "邮箱或密码不正确，或账号无管理权限。" }, { status, headers });
    }
    const result = await response.json();
    if (path === "/api/auth/sign-out") return Response.json({ success: true }, { headers });
    if (!result?.user || result.user.id !== config.ownerId) return Response.json(null, { headers });
    // Session tokens stay in HttpOnly cookies; no token or full account row in JSON.
    return Response.json({ user: { id: result.user.id, email: result.user.email } }, { headers });
  } catch { return fail(503, "登录服务暂不可用，请稍后重试。"); }
}

export const GET = handle;
export const POST = handle;
export async function PUT() { return fail(404, "未找到页面。"); }
export const PATCH = PUT;
export const DELETE = PUT;
export const HEAD = PUT;
export const OPTIONS = PUT;
