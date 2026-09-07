import "server-only";
import { Pool } from "pg";
import { getCloudAuthConfig } from "./config";

let pool: Pool | undefined;

/** Creating a pool is lazy: imports/builds never connect to a database. */
export function getDatabasePool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getCloudAuthConfig().databaseURL,
      max: 4,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
    // Idle connection errors must not log connection strings or crash the process.
    pool.on("error", () => { console.error("[cloud-database] Idle database connection failed."); });
  }
  return pool;
}
