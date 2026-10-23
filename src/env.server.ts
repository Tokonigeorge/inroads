import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  // Later milestones: ANTHROPIC_API_KEY, INNGEST_*, GOOGLE_*, MICROSOFT_*, TOKEN_ENC_*
});

let cached: z.infer<typeof schema> | undefined;

/** Validated server environment. Throws with a readable list of what's missing. */
export function serverEnv() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${issues}\nSee README → Environment variables.`);
  }
  cached = parsed.data;
  return cached;
}
