import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Wraps a Drizzle instance so request-path code can only reach the database through
 * `withUser`, which runs the callback in a transaction as Supabase's `authenticated`
 * role with the user's id in the JWT claims. Postgres RLS therefore applies to server
 * code exactly as it would to a direct client: a missing `where user_id = …` can't leak.
 */
export function createDb(base: Database) {
  return {
    withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
      if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("withUser: invalid user id");
      const claims = JSON.stringify({ sub: userId, role: "authenticated" });
      return base.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('request.jwt.claims', ${claims}, true), set_config('role', 'authenticated', true)`,
        );
        return fn(tx);
      });
    },
    /**
     * Bypasses RLS. Only for system work that has no user (TTL cleanup, sync sweeps that
     * need to decrypt tokens). Import it from `@/server/system` only.
     */
    unsafeSystem: base,
  };
}

export type Db = ReturnType<typeof createDb>;
