import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";

// Interim lists so the app shows real rows. Milestones 3–6 replace these with paginated
// views. `spaceId` null means "All spaces".

export function listGoalsPreview(tx: Tx, spaceId: string | null) {
  return tx
    .select({ id: t.goals.id, text: t.goals.text, weeklyTarget: t.goals.weeklyTarget, space: t.spaces.name })
    .from(t.goals)
    .innerJoin(t.spaces, eq(t.spaces.id, t.goals.spaceId))
    .where(and(isNull(t.goals.archivedAt), eq(t.goals.active, true), isNull(t.spaces.archivedAt), spaceId ? eq(t.goals.spaceId, spaceId) : undefined))
    .orderBy(asc(t.goals.priority), asc(t.goals.createdAt));
}
