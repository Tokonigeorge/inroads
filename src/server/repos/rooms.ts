import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { roomSchema, type RoomInput, type RoomRole } from "@/contracts/rooms";
import { addDays, type IsoDate } from "@/domain/dates";
import { fromRRule, nextOccurrence, occurrences, toRRule, type Recurrence } from "@/domain/recurrence";
import { expandAgenda, type RoomTiming } from "@/domain/zoned";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { guarded } from "./guarded";
import type { Result } from "./spaces";

const fail = (message: string, field?: string): Result<never> => ({ ok: false, message, field });
type EventRow = typeof t.events.$inferSelect;

export function recurrenceOf(e: Pick<EventRow, "rrule" | "startsOn" | "untilOn">): Recurrence {
  const r = fromRRule(e.rrule, e.startsOn);
  return { freq: r.freq, byDays: r.byDays ?? null, nth: r.nth ?? null, until: e.untilOn ?? r.until ?? null };
}

export function timingOf(e: EventRow): RoomTiming {
  return { id: e.id, start: e.startsOn, ...recurrenceOf(e), startTime: e.startTime ? e.startTime.slice(0, 5) : null, allDay: e.allDay, tz: e.tz };
}

async function activeRooms(tx: Tx, spaceId: string | null) {
  return tx
    .select({ e: t.events })
    .from(t.events)
    .innerJoin(t.spaces, eq(t.spaces.id, t.events.spaceId))
    .where(and(isNull(t.events.deletedAt), isNull(t.events.archivedAt), isNull(t.spaces.archivedAt), spaceId ? eq(t.events.spaceId, spaceId) : undefined))
    .then((rows) => rows.map((r) => r.e));
}

async function peopleCounts(tx: Tx) {
  const rows = await tx.select({ id: t.eventPeople.eventId, n: sql<number>`count(distinct person_id)::int` }).from(t.eventPeople).groupBy(t.eventPeople.eventId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

export type UpcomingItem = {
  eventId: string;
  title: string;
  kind: string;
  location: string | null;
  date: IsoDate;
  occurrenceOn: IsoDate;
  time: string | null;
  localTimeLabel: string | null;
  repeats: boolean;
  people: number;
};

/** Every session from today for `days` days, in the user's zone, soonest first. */
export async function listUpcoming(tx: Tx, spaceId: string | null, today: IsoDate, userTz: string, days = 60): Promise<UpcomingItem[]> {
  const rooms = await activeRooms(tx, spaceId);
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const counts = await peopleCounts(tx);
  return expandAgenda(rooms.map(timingOf), today, addDays(today, days), userTz).map((a) => {
    const e = byId.get(a.eventId)!;
    return { ...a, title: e.title, kind: e.kind, location: e.location, repeats: Boolean(e.rrule), people: counts.get(e.id) ?? 0 };
  });
}

/** Recurring rooms with their next date and how often you've gone lately. */
export async function listSeries(tx: Tx, spaceId: string | null, today: IsoDate) {
  const rooms = (await activeRooms(tx, spaceId)).filter((r) => r.rrule);
  const attendance = await tx.select().from(t.eventAttendance).where(eq(t.eventAttendance.attended, true));
  const went = new Set(attendance.map((a) => `${a.eventId}:${a.occurrenceOn}`));
  return rooms
    .map((e) => {
      const timing = timingOf(e);
      const past = occurrences(timing, addDays(today, -365), addDays(today, -1)).slice(-6);
      return {
        id: e.id,
        title: e.title,
        kind: e.kind,
        location: e.location,
        recurrence: recurrenceOf(e),
        next: nextOccurrence(timing, today),
        pastCount: past.length,
        attended: past.filter((d) => went.has(`${e.id}:${d}`)).length,
      };
    })
    .sort((a, b) => (a.next ?? "9999").localeCompare(b.next ?? "9999") || a.title.localeCompare(b.title));
}

/** One-off rooms that have already happened (last 6 months), newest first. */
export async function listPast(tx: Tx, spaceId: string | null, today: IsoDate) {
  const rooms = (await activeRooms(tx, spaceId)).filter((r) => !r.rrule && r.startsOn < today && r.startsOn >= addDays(today, -183));
  const counts = await peopleCounts(tx);
  return rooms.sort((a, b) => b.startsOn.localeCompare(a.startsOn)).map((e) => ({ id: e.id, title: e.title, kind: e.kind, location: e.location, date: e.startsOn, people: counts.get(e.id) ?? 0 }));
}

export async function getRoom(tx: Tx, id: string, today: IsoDate) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await tx
    .select({ e: t.events, space: t.spaces, goal: t.goals })
    .from(t.events)
    .innerJoin(t.spaces, eq(t.spaces.id, t.events.spaceId))
    .leftJoin(t.goals, eq(t.goals.id, t.events.goalId))
    .where(and(eq(t.events.id, id), isNull(t.events.deletedAt)));
  if (!row) return null;
  const e = row.e;
  const timing = timingOf(e);
  const [people, attendance] = await Promise.all([
    tx
      .select({ personId: t.people.id, name: t.people.name, company: t.people.company, position: t.people.position, role: t.eventPeople.role, occurrenceOn: t.eventPeople.occurrenceOn })
      .from(t.eventPeople)
      .innerJoin(t.people, eq(t.people.id, t.eventPeople.personId))
      .where(and(eq(t.eventPeople.eventId, id), isNull(t.people.deletedAt)))
      .orderBy(asc(t.people.name)),
    tx.select().from(t.eventAttendance).where(eq(t.eventAttendance.eventId, id)),
  ]);
  const attended = new Map(attendance.map((a) => [a.occurrenceOn, a.attended]));
  const pastDates = e.rrule ? occurrences(timing, addDays(today, -365), addDays(today, -1)).slice(-8).reverse() : e.startsOn < today ? [e.startsOn] : [];
  return {
    room: e,
    timing,
    recurrence: recurrenceOf(e),
    unsupportedRule: Boolean(e.rruleSource),
    space: { id: row.space.id, name: row.space.name },
    goal: row.goal ? { id: row.goal.id, text: row.goal.text } : null,
    people,
    past: pastDates.map((date) => ({ date, attended: attended.get(date) ?? null })),
    next: occurrences(timing, today, addDays(today, 400)).slice(0, 4),
  };
}
export type RoomDetail = NonNullable<Awaited<ReturnType<typeof getRoom>>>;

function rowFrom(input: RoomInput): Result<Omit<typeof t.events.$inferInsert, "userId">> {
  const parsed = roomSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? "Check the details.", String(issue?.path[0] ?? ""));
  }
  const r = parsed.data;
  const recurrence: Recurrence = {
    freq: r.freq,
    byDays: r.freq === "weekly" || r.freq === "biweekly" ? (r.byDays?.length ? r.byDays : null) : null,
    nth: r.freq === "monthly" || r.freq === "quarterly" ? (r.nth ?? null) : null,
  };
  return {
    ok: true,
    data: {
      spaceId: r.spaceId,
      title: r.title,
      kind: r.kind,
      startsOn: r.startsOn,
      startTime: r.allDay ? null : r.startTime,
      endTime: r.allDay ? null : r.endTime,
      allDay: r.allDay || !r.startTime,
      tz: r.tz,
      location: r.location,
      url: r.url,
      notes: r.notes,
      rrule: toRRule(recurrence),
      untilOn: r.freq === "none" ? null : r.untilOn,
      goalId: r.goalId,
    },
  };
}

export async function createRoom(tx: Tx, userId: string, input: RoomInput): Promise<Result<{ id: string }>> {
  const row = rowFrom(input);
  if (!row.ok) return row;
  const r = await guarded(tx, (sp) => sp.insert(t.events).values({ ...row.data, userId, source: "manual" }).returning({ id: t.events.id }));
  return r.ok ? { ok: true, data: { id: r.value[0].id } } : fail(r.message, "goalId");
}

export async function updateRoom(tx: Tx, id: string, input: RoomInput): Promise<Result<null>> {
  const row = rowFrom(input);
  if (!row.ok) return row;
  const [current] = await tx.select({ spaceId: t.events.spaceId }).from(t.events).where(eq(t.events.id, id));
  if (!current) return fail("This room no longer exists.");
  if (current.spaceId !== row.data.spaceId) {
    const [linked] = await tx.select({ n: sql<number>`count(*)::int` }).from(t.eventPeople).where(eq(t.eventPeople.eventId, id));
    if (linked.n > 0) return fail("Rooms with people linked can't move to another Space. Remove the people first.", "spaceId");
  }
  const r = await guarded(tx, (sp) => sp.update(t.events).set({ ...row.data, rruleSource: null }).where(eq(t.events.id, id)));
  return r.ok ? { ok: true, data: null } : fail(r.message, "goalId");
}

export async function deleteRoom(tx: Tx, id: string) {
  await tx.update(t.events).set({ deletedAt: new Date() }).where(and(eq(t.events.id, id), isNull(t.events.deletedAt)));
}
export async function restoreRoom(tx: Tx, id: string) {
  await tx.update(t.events).set({ deletedAt: null }).where(and(eq(t.events.id, id), isNotNull(t.events.deletedAt)));
}

/** Marks whether you went to one session; null clears it. Only real session dates are accepted. */
export async function setAttendance(tx: Tx, userId: string, eventId: string, occurrenceOn: IsoDate, attended: boolean | null): Promise<Result<null>> {
  const [e] = await tx.select().from(t.events).where(and(eq(t.events.id, eventId), isNull(t.events.deletedAt)));
  if (!e) return fail("This room no longer exists.");
  if (!occurrences(timingOf(e), occurrenceOn, occurrenceOn).length) return fail("The room didn't happen on that date.");
  if (attended === null) {
    await tx.delete(t.eventAttendance).where(and(eq(t.eventAttendance.eventId, eventId), eq(t.eventAttendance.occurrenceOn, occurrenceOn)));
  } else {
    await tx
      .insert(t.eventAttendance)
      .values({ userId, eventId, occurrenceOn, attended })
      .onConflictDoUpdate({ target: [t.eventAttendance.eventId, t.eventAttendance.occurrenceOn], set: { attended } });
  }
  return { ok: true, data: null };
}

export async function linkPerson(tx: Tx, userId: string, eventId: string, personId: string, role: RoomRole): Promise<Result<null>> {
  const r = await guarded(tx, (sp) => sp.insert(t.eventPeople).values({ userId, eventId, personId, role }).onConflictDoNothing());
  return r.ok ? { ok: true, data: null } : fail(r.message);
}

export async function unlinkPerson(tx: Tx, eventId: string, personId: string, role: RoomRole) {
  await tx.delete(t.eventPeople).where(and(eq(t.eventPeople.eventId, eventId), eq(t.eventPeople.personId, personId), eq(t.eventPeople.role, role)));
}

/** Rooms a person is linked to, with the next date for each. */
export async function roomsForPerson(tx: Tx, personId: string, today: IsoDate) {
  const rows = await tx
    .select({ e: t.events, role: t.eventPeople.role })
    .from(t.eventPeople)
    .innerJoin(t.events, eq(t.events.id, t.eventPeople.eventId))
    .where(and(eq(t.eventPeople.personId, personId), isNull(t.events.deletedAt)))
    .orderBy(desc(t.events.startsOn));
  return rows.map(({ e, role }) => {
    const timing = timingOf(e);
    return { id: e.id, title: e.title, role: role as RoomRole, next: nextOccurrence(timing, today), first: e.startsOn, repeats: Boolean(e.rrule) };
  });
}
