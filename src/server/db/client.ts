import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/env.server";
import * as schema from "./schema";
import { createDb, type Db } from "./with-user";

const globalForDb = globalThis as unknown as { inroadsDb?: Db };

/**
 * Connects lazily on first use, so builds and pages that never touch the database don't need
 * DATABASE_URL. One pool per server instance; `prepare: false` keeps us compatible with
 * Supabase's transaction pooler (port 6543).
 */
function getDb(): Db {
  if (!globalForDb.inroadsDb) {
    const client = postgres(serverEnv().DATABASE_URL, { prepare: false, max: 5 });
    globalForDb.inroadsDb = createDb(drizzle(client, { schema }));
  }
  return globalForDb.inroadsDb;
}

export const db: Pick<Db, "withUser"> = {
  withUser: (userId, fn) => getDb().withUser(userId, fn),
};

/**
 * Bypasses RLS. Only for work with no signed-in user or that touches secrets users can't read:
 * OAuth tokens, job progress, scheduled clean-up. Import it only from `src/server/system/`.
 */
export const getSystemDb = () => getDb().unsafeSystem;
