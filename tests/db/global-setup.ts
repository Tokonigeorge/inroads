import "dotenv/config";
import postgres from "postgres";
import type { TestProject } from "vitest/node";
import { runMigrations } from "../../src/server/db/migrate";

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

/**
 * Creates a fresh `inroads_test` database on the server in TEST_DATABASE_URL, installs the
 * Supabase stand-in and applies every migration. Requires a Postgres 15+ with contrib.
 */
export default async function setup(project: TestProject) {
  const admin = process.env.TEST_DATABASE_URL;
  if (!admin) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Point it at a Postgres server, e.g. postgres://postgres:postgres@localhost:5432/postgres",
    );
  }
  const name = "inroads_test";
  const sql = postgres(admin, { max: 1, onnotice: () => {} });
  await sql.unsafe(`drop database if exists ${name} with (force)`);
  await sql.unsafe(`create database ${name}`);
  await sql.end();

  const url = new URL(admin);
  url.pathname = `/${name}`;
  await runMigrations(url.toString(), { stub: true });
  project.provide("dbUrl", url.toString());
}
