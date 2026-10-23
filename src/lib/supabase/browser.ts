"use client";

import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/env.client";

/** Browser client: used only for auth (sign-in) and, later, Realtime job progress. */
export function createSupabaseBrowserClient() {
  if (!clientEnv) throw new Error("Supabase is not configured. See README → Environment variables.");
  return createBrowserClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
