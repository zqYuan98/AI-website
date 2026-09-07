import "server-only";

export class CloudConfigurationError extends Error {
  constructor() { super("线上管理尚未完成配置，请联系站点所有者。"); this.name = "CloudConfigurationError"; }
}

export function cloudLibraryEnabled(): boolean {
  return process.env.RESOURCE_LIBRARY_MODE === "cloud";
}

export function getCloudAuthConfig() {
  const databaseURL = process.env.DATABASE_URL?.trim();
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  const baseURL = process.env.BETTER_AUTH_URL?.trim();
  const ownerId = process.env.LIBRARY_OWNER_ID?.trim();
  if (!cloudLibraryEnabled() || !databaseURL || !secret || secret.length < 32 || !baseURL || !ownerId || ownerId.length > 128) throw new CloudConfigurationError();
  try {
    const database = new URL(databaseURL);
    const origin = new URL(baseURL);
    if (!["postgres:", "postgresql:"].includes(database.protocol)) throw new Error();
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" || (origin.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && loopback && origin.protocol === "http:"))) throw new Error();
    return { databaseURL, secret, baseURL: origin.origin, ownerId };
  } catch { throw new CloudConfigurationError(); }
}

export function cloudAuthConfigured(): boolean {
  try { getCloudAuthConfig(); return true; } catch { return false; }
}
