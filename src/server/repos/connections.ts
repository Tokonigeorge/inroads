import "server-only";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import type { ProviderKind } from "@/contracts/connections";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";

export type ConnectionView = {
  id: string;
  provider: ProviderKind;
  accountEmail: string | null;
  status: string;
  lastError: string | null;
  lastSyncedAt: Date | null;
  spaceId: string | null;
  lastJobId: string | null;
};

/** Connected accounts, without secrets (users can't read the encrypted columns anyway). */
export async function listConnections(tx: Tx): Promise<ConnectionView[]> {
  const rows = await tx
    .select({
      id: t.connections.id,
      provider: t.connections.provider,
      accountEmail: t.connections.accountEmail,
      status: t.connections.status,
      lastError: t.connections.lastError,
      lastSyncedAt: t.connections.lastSyncedAt,
      state: t.connections.syncState,
    })
    .from(t.connections)
    .where(ne(t.connections.status, "revoked"))
    .orderBy(t.connections.createdAt);
  return rows.map(({ state, ...r }) => {
    const s = (state ?? {}) as { spaceId?: string; lastJobId?: string };
    return { ...r, provider: r.provider as ProviderKind, spaceId: s.spaceId ?? null, lastJobId: s.lastJobId ?? null };
  });
}

export async function ownsConnection(tx: Tx, id: string) {
  const [row] = await tx.select({ id: t.connections.id, provider: t.connections.provider }).from(t.connections).where(eq(t.connections.id, id));
  return row ? { id: row.id, provider: row.provider as ProviderKind } : null;
}

export type ImportView = { id: string; type: string; status: string; createdAt: Date; spaceName: string; counts: Record<string, unknown> };

export async function recentImports(tx: Tx, limit = 10): Promise<ImportView[]> {
  const rows = await tx
    .select({ id: t.imports.id, type: t.imports.type, status: t.imports.status, createdAt: t.imports.createdAt, counts: t.imports.counts, spaceName: t.spaces.name })
    .from(t.imports)
    .innerJoin(t.spaces, eq(t.spaces.id, t.imports.spaceId))
    // Things shared into Inroads wait as `share` imports; they aren't imports you'd undo.
    .where(ne(t.imports.type, "share"))
    .orderBy(desc(t.imports.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, counts: (r.counts ?? {}) as Record<string, unknown> }));
}

/** People waiting to be sorted after an import. */
export async function pendingTriageCount(tx: Tx, spaceId: string | null) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(t.personSpaces)
    .innerJoin(t.people, eq(t.people.id, t.personSpaces.personId))
    .where(and(eq(t.personSpaces.triageState, "pending"), isNull(t.people.deletedAt), spaceId ? eq(t.personSpaces.spaceId, spaceId) : undefined));
  return row?.n ?? 0;
}
