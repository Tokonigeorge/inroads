import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inject } from "vitest";
import * as schema from "@/server/db/schema";
import { createDb } from "@/server/db/with-user";

export function connect() {
  const sql = postgres(inject("dbUrl"), { max: 4, onnotice: () => {} });
  const base = createDb(drizzle(sql, { schema }));
  return { sql, db: base, sys: base.unsafeSystem };
}

/** Creates an auth user (as Supabase Auth would); the bootstrap trigger adds profile + Spaces. */
export async function createUser(sql: postgres.Sql, name = "Test User") {
  const id = randomUUID();
  const email = `${id.slice(0, 8)}@example.test`;
  await sql`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${email}, ${JSON.stringify({ full_name: name })}::text::jsonb)`;
  return { id, email };
}

/** Postgres error code from a failed query, for asserting on the kind of failure. */
export async function errorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    return err.code ?? err.cause?.code ?? "unknown";
  }
  return "no error";
}
