import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { listSpaces } from "@/server/repos/spaces";

/** Spaces with their active goals, for the room form. */
export async function loadRoomSpaceChoices(tx: Tx) {
  const [spaces, goals] = await Promise.all([
    listSpaces(tx),
    tx.select({ id: t.goals.id, text: t.goals.text, spaceId: t.goals.spaceId }).from(t.goals).where(and(eq(t.goals.active, true), isNull(t.goals.archivedAt))).orderBy(asc(t.goals.priority)),
  ]);
  return spaces.map((s) => ({ id: s.id, name: s.name, goals: goals.filter((g) => g.spaceId === s.id).map((g) => ({ id: g.id, text: g.text })) }));
}
