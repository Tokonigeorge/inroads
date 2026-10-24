/**
 * Usage: pnpm db:migrate          (Supabase, or any Postgres that already has the auth schema)
 *        pnpm db:migrate:local    (plain Postgres: installs the Supabase stand-in first)
 */
import "dotenv/config";
import { runMigrations } from "../src/server/db/migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
runMigrations(url, { stub: process.argv.includes("--stub") })
  .then(() => console.log("Migrations applied."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
