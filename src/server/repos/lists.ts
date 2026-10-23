import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";

// Interim lists so milestone 1 shows real rows. Milestones 3–5 replace these with
// paginated, Space-aware queries.

export function listPeoplePreview(userId: string, limit = 50) {
  return db.withUser(userId, (tx) =>
    tx
      .select({ id: t.people.id, name: t.people.name, company: t.people.company, position: t.people.position, lastTouchedOn: t.people.lastTouchedOn })
      .from(t.people)
      .where(isNull(t.people.deletedAt))
      .orderBy(asc(t.people.name))
      .limit(limit),
  );
}

export function listEventsPreview(userId: string, limit = 50) {
  return db.withUser(userId, (tx) =>
    tx
      .select({ id: t.events.id, title: t.events.title, startsOn: t.events.startsOn, location: t.events.location, rrule: t.events.rrule })
      .from(t.events)
      .where(isNull(t.events.deletedAt))
      .orderBy(desc(t.events.startsOn))
      .limit(limit),
  );
}

export function listGoalsPreview(userId: string) {
  return db.withUser(userId, (tx) =>
    tx
      .select({ id: t.goals.id, text: t.goals.text, weeklyTarget: t.goals.weeklyTarget, space: t.spaces.name })
      .from(t.goals)
      .innerJoin(t.spaces, eq(t.spaces.id, t.goals.spaceId))
      .where(and(isNull(t.goals.archivedAt), eq(t.goals.active, true)))
      .orderBy(asc(t.goals.priority), asc(t.goals.createdAt)),
  );
}
