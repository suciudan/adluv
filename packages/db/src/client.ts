import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";

import { loadWorkspaceEnv } from "@adluv/config/load-env";

import * as schema from "./schema/app";

let client: Pool | undefined;

loadWorkspaceEnv();

export function getPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!client) {
    client = createPool({
      uri: connectionString,
      timezone: "Z",
      connectionLimit: 10,
    });
  }

  return client;
}

export function getDb(connectionString = process.env.DATABASE_URL) {
  return drizzle(getPool(connectionString), { schema, mode: "default" });
}

// CLI entry points should release their connections when their work finishes.
export async function closePool() {
  const pool = client;
  client = undefined;
  await pool?.end();
}
