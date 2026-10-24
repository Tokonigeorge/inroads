import "server-only";
import { and, eq, inArray, lt, or, isNull, sql } from "drizzle-orm";
import { decryptJson, decryptSecret, encryptJson, encryptSecret } from "@/server/crypto/tokens";
import { getSystemDb } from "@/server/db/client";
import * as t from "@/server/db/schema";
import type { Database } from "@/server/db/with-user";

export type Provider = "google" | "microsoft" | "apple_ics";
export type SyncState = {
  spaceId?: string;
  contacts?: { syncToken?: string | null; deltaLink?: string | null };
  calendars?: Record<string, string>;
  lastSummary?: Record<string, unknown>;
  lastImportId?: string;
  lastJobId?: string;
};
export type StoredTokens = { access_token: string; refresh_token?: string; expires_at: number; scope: string };

/** System-level access to connections: the only code that ever sees decrypted tokens. */
export function connectionsStore(sys: Database = getSystemDb()) {
  return {
    async upsert(input: { userId: string; provider: Provider; accountEmail: string; scopes: string[]; tokens?: StoredTokens; icsUrl?: string; spaceId: string }) {
      const values = {
        userId: input.userId,
        provider: input.provider,
        accountEmail: input.accountEmail,
        scopes: input.scopes,
        tokensEnc: input.tokens ? encryptJson(input.tokens) : null,
        icsUrlEnc: input.icsUrl ? encryptSecret(input.icsUrl) : null,
        status: "active",
        lastError: null,
        syncState: { spaceId: input.spaceId } satisfies SyncState,
      };
      const [row] = await sys
        .insert(t.connections)
        .values(values)
        .onConflictDoUpdate({
          target: [t.connections.userId, t.connections.provider, t.connections.accountEmail],
          set: {
            scopes: values.scopes,
            tokensEnc: values.tokensEnc,
            icsUrlEnc: values.icsUrlEnc,
            status: "active",
            lastError: null,
            syncState: sql`${t.connections.syncState} || ${JSON.stringify({ spaceId: input.spaceId })}::jsonb`,
          },
        })
        .returning({ id: t.connections.id });
      return row.id;
    },

    async get(id: string) {
      const [c] = await sys.select().from(t.connections).where(eq(t.connections.id, id));
      if (!c) return null;
      return {
        ...c,
        provider: c.provider as Provider,
        syncState: (c.syncState ?? {}) as SyncState,
        tokens: c.tokensEnc ? decryptJson<StoredTokens>(c.tokensEnc) : null,
        icsUrl: c.icsUrlEnc ? decryptSecret(c.icsUrlEnc) : null,
      };
    },

    async saveTokens(id: string, tokens: StoredTokens) {
      await sys.update(t.connections).set({ tokensEnc: encryptJson(tokens) }).where(eq(t.connections.id, id));
    },

    async saveSync(id: string, state: SyncState) {
      await sys
        .update(t.connections)
        .set({ syncState: sql`${t.connections.syncState} || ${JSON.stringify(state)}::jsonb`, lastSyncedAt: new Date(), status: "active", lastError: null })
        .where(eq(t.connections.id, id));
    },

    async setStatus(id: string, status: "active" | "error" | "revoked" | "paused", lastError: string | null = null) {
      await sys.update(t.connections).set({ status, lastError }).where(eq(t.connections.id, id));
    },

    /** Forget the secrets; the people and rooms already imported stay. */
    async disconnect(id: string, userId: string) {
      await sys
        .update(t.connections)
        .set({ status: "revoked", tokensEnc: null, icsUrlEnc: null, lastError: null })
        .where(and(eq(t.connections.id, id), eq(t.connections.userId, userId)));
    },

    /** Connections due for a background sync. */
    async due(providers: Provider[], olderThanMinutes: number) {
      const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
      return sys
        .select({ id: t.connections.id, userId: t.connections.userId, provider: t.connections.provider })
        .from(t.connections)
        .where(and(eq(t.connections.status, "active"), inArray(t.connections.provider, providers), or(isNull(t.connections.lastSyncedAt), lt(t.connections.lastSyncedAt, cutoff))));
    },
  };
}
