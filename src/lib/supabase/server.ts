import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { clientEnv } from "@/env.client";

/** Per-request Supabase client for Server Components, Route Handlers and Server Actions. */
export async function createSupabaseServerClient() {
  // Request-time only: the auth client reads the clock as soon as it's created, which Next
  // forbids during prerendering. Reading cookies first also means nothing can throw at build.
  await connection();
  const store = await cookies();
  if (!clientEnv) throw new Error("Supabase is not configured. See README → Environment variables.");
  return createServerClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes them.
        }
      },
    },
  });
}
