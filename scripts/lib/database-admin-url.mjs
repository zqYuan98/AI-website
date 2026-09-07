/** CLI-only selection. Never import this helper into the website runtime. */
export function selectAdminDatabaseUrl(environment = process.env) {
  const runtimeValue = environment.DATABASE_URL?.trim();
  const adminValue = environment.DATABASE_ADMIN_URL?.trim();
  if (!runtimeValue) throw new Error("Configure DATABASE_URL before running database administration.");
  if (!adminValue) return runtimeValue;
  try {
    const runtime = new URL(runtimeValue), admin = new URL(adminValue);
    const host = url => url.hostname.split(".").map((part, index) => index === 0 ? part.replace(/-pooler$/, "") : part).join(".");
    if (![runtime, admin].every(url => ["postgres:", "postgresql:"].includes(url.protocol) && url.username && url.password && url.pathname.length > 1)
      || host(runtime) !== host(admin) || (runtime.port || "5432") !== (admin.port || "5432")
      || decodeURIComponent(runtime.pathname) !== decodeURIComponent(admin.pathname)
      || decodeURIComponent(runtime.username) !== decodeURIComponent(admin.username)
      || admin.hostname.split(".")[0].endsWith("-pooler")) throw new Error();
    return adminValue;
  } catch { throw new Error("DATABASE_ADMIN_URL must be the direct connection for the same database, branch and private role as DATABASE_URL."); }
}
