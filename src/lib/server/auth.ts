import "server-only";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import type { Pool } from "pg";
import { cloudLibraryEnabled, getCloudAuthConfig } from "./config";
import { getDatabasePool } from "./database";

export const AUTH_TABLES = ["library_auth_user", "library_auth_session", "library_auth_account", "library_auth_verification", "library_auth_rate_limit"] as const;

/** Also used by the controlled migration CLI and isolated database checks. */
export function createOwnerAuthOptions(database: Pool, config: ReturnType<typeof getCloudAuthConfig>): BetterAuthOptions {
  return {
    appName: "Vitamin Resource Library",
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    telemetry: { enabled: false },
    database,
    trustedOrigins: [config.baseURL],
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128, autoSignIn: false, revokeSessionsOnPasswordReset: true },
    user: { modelName: AUTH_TABLES[0], changeEmail: { enabled: false }, deleteUser: { enabled: false } },
    session: { modelName: AUTH_TABLES[1], cookieCache: { enabled: false }, expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    account: { modelName: AUTH_TABLES[2], accountLinking: { enabled: false } },
    verification: { modelName: AUTH_TABLES[3] },
    rateLimit: { enabled: true, storage: "database", modelName: AUTH_TABLES[4], window: 60, max: 60, customRules: { "/sign-in/email": { window: 60, max: 5 } } },
    advanced: {
      useSecureCookies: config.baseURL.startsWith("https:"),
      cookiePrefix: "vitamin-owner",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      // The Vercel ingress overwrites this header. Never trust caller x-forwarded-for.
      ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for"] },
    },
    databaseHooks: { session: { create: { before: async session => {
      if (session.userId !== config.ownerId) throw new APIError("UNAUTHORIZED", { message: "登录信息无效。" });
    } } } },
    logger: { level: "error", log: () => { console.error("[owner-auth] Authentication operation failed."); } },
    onAPIError: { onError: () => { console.error("[owner-auth] Authentication request failed."); } },
  };
}

export function createOwnerAuth(database: Pool, config: ReturnType<typeof getCloudAuthConfig>) {
  return betterAuth(createOwnerAuthOptions(database, config));
}

let auth: ReturnType<typeof createOwnerAuth> | undefined;
export function getAuth() {
  auth ??= createOwnerAuth(getDatabasePool(), getCloudAuthConfig());
  return auth;
}

export async function getOwnerSession(headers: Headers): Promise<{ user: { id: string; email: string } } | null> {
  if (!cloudLibraryEnabled()) return null;
  const config = getCloudAuthConfig();
  const session = await getAuth().api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } });
  if (!session || session.user.id !== config.ownerId || session.session.expiresAt.getTime() <= Date.now()) return null;
  return { user: { id: session.user.id, email: session.user.email } };
}
