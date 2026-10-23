import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies supabase/migrations in order. With `stub`, first installs the Supabase stand-in
 * (auth schema, roles) so plain Postgres works for tests. Never use `stub` against Supabase.
 */
export async function runMigrations(url: string, opts: { stub?: boolean } = {}) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    if (opts.stub) await sql.unsafe(readFileSync("supabase/tests/supabase-stub.sql", "utf8"));
    await migrate(drizzle(sql), { migrationsFolder: "supabase/migrations" });
  } finally {
    await sql.end();
  }
}
