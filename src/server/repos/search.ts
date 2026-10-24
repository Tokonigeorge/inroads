import "server-only";
import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Quick search for the command palette: a few people, rooms and goals whose names match. */
export async function quickSearch(tx: Tx, q: string, limit = 5) {
  const term = q.trim().slice(0, 80);
  if (!term) return { people: [], rooms: [], goals: [] };
  const like = `%${escapeLike(term)}%`;
  const starts = `${escapeLike(term)}%`;
  const [people, rooms, goals] = await Promise.all([
    tx
      .select({ id: t.people.id, name: t.people.name, company: t.people.company, position: t.people.position })
      .from(t.people)
      .where(and(isNull(t.people.deletedAt), or(ilike(t.people.name, like), ilike(t.people.company, like))))
      .orderBy(sql`case when ${t.people.name} ilike ${starts} then 0 else 1 end`, asc(t.people.name))
      .limit(limit),
    tx
      .select({ id: t.events.id, title: t.events.title })
      .from(t.events)
      .innerJoin(t.spaces, eq(t.spaces.id, t.events.spaceId))
      .where(and(isNull(t.events.deletedAt), isNull(t.spaces.archivedAt), ilike(t.events.title, like)))
      .orderBy(asc(t.events.title))
      .limit(limit),
    tx
      .select({ id: t.goals.id, text: t.goals.text })
      .from(t.goals)
      .innerJoin(t.spaces, eq(t.spaces.id, t.goals.spaceId))
      .where(and(isNull(t.goals.archivedAt), isNull(t.spaces.archivedAt), ilike(t.goals.text, like)))
      .orderBy(asc(t.goals.text))
      .limit(limit),
  ]);
  return {
    people: people.map((p) => ({ id: p.id, name: p.name, detail: [p.position, p.company].filter(Boolean).join(" at ") })),
    rooms,
    goals,
  };
}
