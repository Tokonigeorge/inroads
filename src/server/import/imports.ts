import "server-only";
import { desc, eq } from "drizzle-orm";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";

export async function startImport(tx: Tx, input: { userId: string; spaceId: string; type: string; connectionId?: string | null; jobId?: string | null }) {
  const [row] = await tx
    .insert(t.imports)
    .values({ userId: input.userId, spaceId: input.spaceId, type: input.type, status: "parsing", connectionId: input.connectionId ?? null, jobId: input.jobId ?? null })
    .returning();
  return row;
}

export async function finishImport(tx: Tx, id: string, counts: Record<string, unknown>, status: "done" | "failed" = "done", error?: string) {
  await tx.update(t.imports).set({ status, counts, error: error ?? null, committedAt: status === "done" ? new Date() : null }).where(eq(t.imports.id, id));
}

export async function listImports(tx: Tx, limit = 20) {
  return tx.select().from(t.imports).orderBy(desc(t.imports.createdAt)).limit(limit);
}
