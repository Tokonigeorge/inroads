import { readFileSync } from "node:fs";
import postgres from "postgres";
import { E2E_META } from "../global-setup";

/** Direct access to the e2e database, for arranging state the UI can't create yet. */
export function e2eDb() {
  const meta = JSON.parse(readFileSync(E2E_META, "utf8")) as { userId: string; dbUrl: string };
  return { sql: postgres(meta.dbUrl, { max: 1, onnotice: () => {} }), userId: meta.userId };
}
