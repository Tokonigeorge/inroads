import "server-only";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { classifyMoves } from "@/domain/goal-progress";
import { roomRoi, type RoiMove } from "@/domain/room-roi";
import type { IsoDate } from "@/domain/dates";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { goalWithStages } from "./goals";

/** People you met at a room ("met there"), with the session you met them at. */
async function metThere(tx: Tx, eventIds: string[]) {
  if (!eventIds.length) return [];
  return tx
    .select({
      eventId: t.eventPeople.eventId,
      id: t.people.id,
      name: t.people.name,
      metOn: sql<string>`coalesce(${t.eventPeople.occurrenceOn}, ${t.events.startsOn})::text`,
      spaceId: t.events.spaceId,
    })
    .from(t.eventPeople)
    .innerJoin(t.people, eq(t.people.id, t.eventPeople.personId))
    .innerJoin(t.events, eq(t.events.id, t.eventPeople.eventId))
    .where(and(inArray(t.eventPeople.eventId, eventIds), eq(t.eventPeople.role, "met_there"), isNull(t.people.deletedAt)));
}

/** What one room has led to: people met there, touches since, movement on your goals. */
export async function roomImpact(tx: Tx, eventId: string, today: IsoDate) {
  const met = await metThere(tx, [eventId]);
  if (!met.length) return roomRoi({ today, met: [], touches: [], moves: [] });
  const spaceId = met[0].spaceId;
  const ids = [...new Set(met.map((m) => m.id))];
  const earliest = met.map((m) => m.metOn).sort()[0];
  const [touches, history] = await Promise.all([
    tx
      .select({ personId: t.interactions.personId, on: sql<string>`${t.interactions.occurredOn}::text` })
      .from(t.interactions)
      .where(and(inArray(t.interactions.personId, ids), eq(t.interactions.spaceId, spaceId), gte(t.interactions.occurredOn, earliest))),
    tx
      .select({ personId: t.goalLinks.personId, goalId: t.goalLinks.goalId, from: t.goalLinkHistory.fromStage, to: t.goalLinkHistory.toStage, at: t.goalLinkHistory.movedAt })
      .from(t.goalLinkHistory)
      .innerJoin(t.goalLinks, eq(t.goalLinks.id, t.goalLinkHistory.goalLinkId))
      .innerJoin(t.goals, and(eq(t.goals.id, t.goalLinks.goalId), eq(t.goals.spaceId, spaceId)))
      .where(and(inArray(t.goalLinks.personId, ids), gte(t.goalLinkHistory.movedAt, new Date(`${earliest}T00:00:00Z`)))),
  ]);
  // One meeting per person: the first session you met them at.
  const first = new Map<string, { id: string; name: string; metOn: string }>();
  for (const m of met) if (!first.has(m.id) || m.metOn < first.get(m.id)!.metOn) first.set(m.id, { id: m.id, name: m.name, metOn: m.metOn });
  const moves: RoiMove[] = [];
  for (const goalId of [...new Set(history.map((h) => h.goalId))]) {
    const g = await goalWithStages(tx, goalId);
    if (!g) continue;
    for (const personId of ids) {
      const metOn = first.get(personId)!.metOn;
      const mine = history.filter((h) => h.goalId === goalId && h.personId === personId && h.at.toISOString().slice(0, 10) >= metOn);
      if (!mine.length) continue;
      const c = classifyMoves(mine.map((h) => ({ from: h.from, to: h.to })), g.stages);
      moves.push({ personId, forward: c.forward, won: c.won });
    }
  }
  return roomRoi({ today, met: [...first.values()], touches, moves });
}

/** For the rooms list: how many people you met at each room and how many you're still in touch with. */
export async function roomImpactCounts(tx: Tx, eventIds: string[], today: IsoDate) {
  const met = await metThere(tx, eventIds);
  const out = new Map<string, { met: number; inTouchNow: number }>();
  if (!met.length) return out;
  const ids = [...new Set(met.map((m) => m.id))];
  const touches = await tx
    .select({ personId: t.interactions.personId, spaceId: t.interactions.spaceId, on: sql<string>`${t.interactions.occurredOn}::text` })
    .from(t.interactions)
    .where(inArray(t.interactions.personId, ids));
  for (const eventId of eventIds) {
    const byPerson = new Map<string, (typeof met)[number]>();
    for (const m of met) if (m.eventId === eventId && (!byPerson.has(m.id) || m.metOn < byPerson.get(m.id)!.metOn)) byPerson.set(m.id, m);
    const here = [...byPerson.values()];
    if (!here.length) continue;
    const r = roomRoi({ today, met: here, touches: touches.filter((x) => x.spaceId === here[0].spaceId), moves: [] });
    out.set(eventId, { met: r.met, inTouchNow: r.inTouchNow });
  }
  return out;
}
