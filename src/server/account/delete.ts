import "server-only";
import { eq, sql } from "drizzle-orm";
import { getSystemDb } from "@/server/db/client";
import * as t from "@/server/db/schema";
import type { Database } from "@/server/db/with-user";
import { revokeGoogle } from "@/server/integrations/google";
import type { Fetch } from "@/server/integrations/http";
import { connectionsStore } from "@/server/system/connections";

type Deps = { sys?: Database; fetch?: Fetch; supabaseUrl?: string; serviceRoleKey?: string };

/**
 * Deletes an account for good: asks Google to revoke its tokens, forgets every stored secret,
 * then deletes the auth user, which cascades to every row the user owns. Files are never
 * stored (DECISIONS #70), so there is nothing in Storage to remove.
 */
export async function deleteAccount(userId: string, deps: Deps = {}) {
  const sys = deps.sys ?? getSystemDb();
  const f = deps.fetch ?? fetch;
  const store = connectionsStore(sys);
  const conns = await sys.select({ id: t.connections.id, provider: t.connections.provider }).from(t.connections).where(eq(t.connections.userId, userId));
  for (const c of conns) {
    if (c.provider === "google") {
      const full = await store.get(c.id).catch(() => null);
      const token = full?.tokens?.refresh_token ?? full?.tokens?.access_token;
      if (token) await revokeGoogle(f, token);
    }
    await store.disconnect(c.id, userId);
  }

  const url = deps.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = deps.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    // The Admin API also clears sessions and linked identities.
    const res = await f(`${url}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok && res.status !== 404) throw new Error(`Couldn't delete the sign-in account (${res.status}).`);
  }
  // Without a service key (local development, tests), or as a backstop, delete the row directly.
  await sys.execute(sql`delete from auth.users where id = ${userId}`);
}
