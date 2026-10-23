import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { runMigrations } from "../../src/server/db/migrate";
import { sessionCookie } from "./support/auth";

export const E2E_DB = "inroads_e2e";
export const STORAGE_STATE = "tests/e2e/.auth/user.json";
export const E2E_META = "tests/e2e/.auth/meta.json";

/** Fresh database, one signed-in test user, and a saved browser session for it. */
export default async function globalSetup() {
  const admin = process.env.TEST_DATABASE_URL;
  if (!admin) throw new Error("TEST_DATABASE_URL is not set (see README → Tests).");
  const sql = postgres(admin, { max: 1, onnotice: () => {} });
  await sql.unsafe(`drop database if exists ${E2E_DB} with (force)`);
  await sql.unsafe(`create database ${E2E_DB}`);
  await sql.end();

  const url = new URL(admin);
  url.pathname = `/${E2E_DB}`;
  await runMigrations(url.toString(), { stub: true });

  const user = { id: randomUUID(), email: "ada.e2e@example.test" };
  const db = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await db`insert into auth.users (id, email, raw_user_meta_data) values (${user.id}, ${user.email}, ${JSON.stringify({ full_name: "Ada Lovelace" })}::text::jsonb)`;
  await db.end();

  const cookie = sessionCookie(user);
  mkdirSync("tests/e2e/.auth", { recursive: true });
  writeFileSync(E2E_META, JSON.stringify({ userId: user.id, dbUrl: url.toString() }));
  writeFileSync(
    STORAGE_STATE,
    JSON.stringify({
      cookies: [{ ...cookie, domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }],
      origins: [],
    }),
  );
}
