const HOST_ALIASES: Record<string, string> = {
  "chat.openai.com": "chatgpt.com",
  "www.chatgpt.com": "chatgpt.com",
};

/** Comparison only: keep the original destination/path/query in the saved entry. */
export function canonicalToolUrl(value: string): string {
  const url = new URL(value);
  let host = url.hostname.toLowerCase().replace(/\.+$/, "").replace(/^www\./, "");
  host = HOST_ALIASES[host] ?? host;
  let pathname = url.pathname.replace(/\/+$/, "");
  if (host === "vercel.com" && pathname === "/dashboard") pathname = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return `${host}${url.port ? `:${url.port}` : ""}${pathname}${url.search}${url.hash}`;
}

export function validatedToolUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) throw new Error("网址格式不正确。");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("请填写完整的网址，例如 https://example.com。"); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("只支持不含账号密码的 HTTP / HTTPS 网址。");
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host)) {
    throw new Error("请填写公开网站域名，不能使用本机或内网地址。");
  }
  url.hostname = host;
  return url.toString();
}
