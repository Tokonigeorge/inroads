import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./supabase/migrations",
  migrations: { prefix: "supabase" },
  entities: { roles: { provider: "supabase" } },
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/inroads" },
});
