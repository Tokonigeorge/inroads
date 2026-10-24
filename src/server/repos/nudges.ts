import "server-only";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { addDays, type IsoDate } from "@/domain/dates";
import { buildNudges, nudgeStateFor, type NudgePerson, type NudgeSnapshot } from "@/domain/nudges";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { pendingTriageCount } from "./connections";
import { countDuplicates } from "./merge";
import { countPendingAiSuggestions } from "./suggestions";
import { personRollup } from "./people";
import { listUpcoming, roomsToDebrief, type UpcomingItem } from "./rooms";

const detailOf = (position: string | null, company: string | null) => [position, company].filter(Boolean).join(" at ");

type Ctx = { spaceId: string | null; today: IsoDate; tz: string };

export type PrepPerson = NudgePerson & { lastTouch: { on: IsoDate; summary: string } | null; promise: string | null };
export type AgendaEntry = UpcomingItem & { attendees: PrepPerson[] };

/** People linked to each session (whole series or that date), with their last touch and what you owe them. */
async function sessionPeople(tx: Tx, sessions: UpcomingItem[]) {
  const ids = [...new Set(sessions.map((s) => s.eventId))];
  const out = new Map<string, PrepPerson[]>();
  if (!ids.length) return out;
  const links = await tx
    .select({ eventId: t.eventPeople.eventId, occurrenceOn: t.eventPeople.occurrenceOn, id: t.people.id, name: t.people.name, company: t.people.company, position: t.people.position, spaceId: t.events.spaceId })
    .from(t.eventPeople)
    .innerJoin(t.people, eq(t.people.id, t.eventPeople.personId))
    .innerJoin(t.events, eq(t.events.id, t.eventPeople.eventId))
    .where(and(inArray(t.eventPeople.eventId, ids), isNull(t.people.deletedAt)));
  const personIds = [...new Set(links.map((l) => l.id))];
  const [touches, promises] = personIds.length
    ? await Promise.all([
        tx
          .selectDistinctOn([t.interactions.personId, t.interactions.spaceId], {
            personId: t.interactions.personId,
            spaceId: t.interactions.spaceId,
            on: t.interactions.occurredOn,
            summary: t.interactions.summary,
            type: t.interactions.type,
          })
          .from(t.interactions)
          .where(inArray(t.interactions.personId, personIds))
          .orderBy(t.interactions.personId, t.interactions.spaceId, desc(t.interactions.occurredOn), desc(t.interactions.createdAt)),
        tx
          .select({ personId: t.commitments.personId, spaceId: t.commitments.spaceId, text: t.commitments.text })
          .from(t.commitments)
          .where(and(inArray(t.commitments.personId, personIds), isNull(t.commitments.doneAt), eq(t.commitments.owner, "me")))
          .orderBy(sql`${t.commitments.dueOn} asc nulls last`),
      ])
    : [[], []];
  for (const s of sessions) {
    const seen = new Set<string>();
    const people: PrepPerson[] = [];
    for (const l of links) {
      if (l.eventId !== s.eventId || (l.occurrenceOn && l.occurrenceOn !== s.occurrenceOn) || seen.has(l.id)) continue;
      seen.add(l.id);
      const last = touches.find((x) => x.personId === l.id && x.spaceId === l.spaceId);
      people.push({
        id: l.id,
        name: l.name,
        detail: detailOf(l.position, l.company),
        lastTouch: last ? { on: last.on, summary: last.summary ?? "" } : null,
        promise: promises.find((p) => p.personId === l.id && p.spaceId === l.spaceId)?.text ?? null,
      });
    }
    out.set(`${s.eventId}:${s.occurrenceOn}`, people);
  }
  return out;
}

/** Today's sessions, in the user's zone, with prep for each person you'll see. */
export async function todayAgenda(tx: Tx, ctx: Ctx): Promise<AgendaEntry[]> {
  const sessions = (await listUpcoming(tx, ctx.spaceId, ctx.today, ctx.tz, 0)).filter((s) => s.date === ctx.today);
  const people = await sessionPeople(tx, sessions);
  return sessions.map((s) => ({ ...s, attendees: people.get(`${s.eventId}:${s.occurrenceOn}`) ?? [] }));
}

async function hiddenKeys(tx: Tx) {
  const now = new Date();
  const rows = await tx
    .select({ key: t.nudgeStates.key })
    .from(t.nudgeStates)
    .where(and(gt(t.nudgeStates.expiresAt, now), or(isNotNull(t.nudgeStates.dismissedAt), gt(t.nudgeStates.snoozedUntil, now))));
  return new Set(rows.map((r) => r.key));
}

/** Loads only the candidates each rule needs, so this stays quick with thousands of people. */
export async function loadNudgeSnapshot(tx: Tx, ctx: Ctx): Promise<NudgeSnapshot> {
  const membership: SQL[] = [sql`ps.archived_at is null`];
  if (ctx.spaceId) membership.push(sql`ps.space_id = ${ctx.spaceId}`);
  const rollup = personRollup(membership);
  const bdays = Array.from({ length: 8 }, (_, i) => addDays(ctx.today, i).slice(5));
  if (bdays.includes("02-28")) bdays.push("02-29");

  type Row = { id: string; name: string; company: string | null; position: string | null; last_touched_on: string | null; due_on: string | null; cadence: number | null; birthday: string | null; created_on: string };
  const select = sql`select id, name, company, position, last_touched_on::text, r_due_on::text as due_on, cadence, birthday, (created_at at time zone 'UTC')::date::text as created_on from base`;
  const spaceOnly = <T extends SQL | undefined>(col: T) => (ctx.spaceId ? eq(t.commitments.spaceId, ctx.spaceId) : col);

  const [due, birthdays, context, owed, owedToMe, upcoming, triagePending, hidden, duplicates, suggestions, afterRooms] = await Promise.all([
    tx.execute<Row>(sql`${rollup} ${select} where deleted_at is null and not unsorted and r_due_on <= ${ctx.today}::date order by r_due_on asc, id limit 40`),
    tx.execute<Row>(sql`${rollup} ${select} where deleted_at is null and birthday = any(${sql.raw(`array[${bdays.map((d) => `'${d}'`).join(",")}]`)})`),
    tx.execute<Row>(
      sql`${rollup} ${select} where deleted_at is null and needs_context and not unsorted and source = 'manual' and not example and created_at >= now() - interval '15 days' order by created_at desc limit 10`,
    ),
    tx
      .select({ id: t.commitments.id, text: t.commitments.text, dueOn: t.commitments.dueOn, pid: t.people.id, name: t.people.name, company: t.people.company, position: t.people.position })
      .from(t.commitments)
      .innerJoin(t.people, eq(t.people.id, t.commitments.personId))
      .innerJoin(t.spaces, eq(t.spaces.id, t.commitments.spaceId))
      .where(
        and(
          isNull(t.commitments.doneAt),
          eq(t.commitments.owner, "me"),
          or(isNull(t.commitments.dueOn), sql`${t.commitments.dueOn} <= ${addDays(ctx.today, 3)}`),
          isNull(t.people.deletedAt),
          isNull(t.spaces.archivedAt),
          spaceOnly(undefined),
        ),
      )
      .orderBy(sql`${t.commitments.dueOn} asc nulls last`)
      .limit(30),
    tx
      .select({ id: t.commitments.id, text: t.commitments.text, dueOn: t.commitments.dueOn, pid: t.people.id, name: t.people.name, company: t.people.company, position: t.people.position })
      .from(t.commitments)
      .innerJoin(t.people, eq(t.people.id, t.commitments.personId))
      .innerJoin(t.spaces, eq(t.spaces.id, t.commitments.spaceId))
      .where(and(isNull(t.commitments.doneAt), eq(t.commitments.owner, "them"), lt(t.commitments.dueOn, ctx.today), isNull(t.people.deletedAt), isNull(t.spaces.archivedAt), spaceOnly(undefined)))
      .orderBy(asc(t.commitments.dueOn))
      .limit(20),
    listUpcoming(tx, ctx.spaceId, ctx.today, ctx.tz, 7),
    pendingTriageCount(tx, ctx.spaceId),
    hiddenKeys(tx),
    countDuplicates(tx),
    countPendingAiSuggestions(tx, ctx.spaceId),
    roomsToDebrief(tx, ctx.spaceId, ctx.today, ctx.tz),
  ]);

  const soon = upcoming.filter((s) => s.date <= addDays(ctx.today, 3));
  const prep = await sessionPeople(tx, soon);
  const person = (r: { id: string; name: string; company: string | null; position: string | null }): NudgePerson => ({ id: r.id, name: r.name, detail: detailOf(r.position, r.company) });

  return {
    today: ctx.today,
    birthdays: [...birthdays].filter((r) => r.birthday).map((r) => ({ ...person(r), birthday: r.birthday! })),
    due: [...due].map((r) => ({ ...person(r), dueOn: r.due_on!, lastTouchedOn: r.last_touched_on, cadenceDays: r.cadence! })),
    needContext: [...context].map((r) => ({ ...person(r), createdOn: r.created_on })),
    owed: owed.map((c) => ({ id: c.id, text: c.text, dueOn: c.dueOn, person: person({ id: c.pid, name: c.name, company: c.company, position: c.position }) })),
    owedToMe: owedToMe.map((c) => ({ id: c.id, text: c.text, dueOn: c.dueOn!, person: person({ id: c.pid, name: c.name, company: c.company, position: c.position }) })),
    meetings: soon.flatMap((s) =>
      (prep.get(`${s.eventId}:${s.occurrenceOn}`) ?? []).slice(0, 6).map((p) => ({
        person: { id: p.id, name: p.name, detail: p.detail },
        eventId: s.eventId,
        title: s.title,
        date: s.date,
        time: s.time,
        lastTouch: p.lastTouch,
        promise: p.promise,
      })),
    ),
    rooms: upcoming.filter((s) => s.kind !== "meeting").map((s) => ({ eventId: s.eventId, title: s.title, date: s.date, time: s.time, location: s.location })),
    afterRooms,
    triagePending,
    duplicates,
    suggestions,
    hidden,
  };
}

export async function listNudges(tx: Tx, ctx: Ctx) {
  return buildNudges(await loadNudgeSnapshot(tx, ctx));
}

export async function setNudgeState(tx: Tx, userId: string, key: string, action: { type: "snooze"; days: number } | { type: "dismiss" }) {
  const state = nudgeStateFor(key, action, new Date());
  await tx
    .insert(t.nudgeStates)
    .values({ userId, key, ...state })
    .onConflictDoUpdate({ target: [t.nudgeStates.userId, t.nudgeStates.key], set: state });
}

export async function clearNudgeState(tx: Tx, key: string) {
  await tx.delete(t.nudgeStates).where(eq(t.nudgeStates.key, key));
}

/** The active Spaces of each person on a card, so "Log a touch" can ask which one. */
export async function personSpacesFor(tx: Tx, personIds: string[]) {
  const out: Record<string, { id: string; name: string }[]> = {};
  if (!personIds.length) return out;
  const rows = await tx
    .select({ personId: t.personSpaces.personId, id: t.spaces.id, name: t.spaces.name })
    .from(t.personSpaces)
    .innerJoin(t.spaces, eq(t.spaces.id, t.personSpaces.spaceId))
    .where(and(inArray(t.personSpaces.personId, [...new Set(personIds)]), isNull(t.personSpaces.archivedAt), isNull(t.spaces.archivedAt)))
    .orderBy(asc(t.spaces.position));
  for (const r of rows) (out[r.personId] ??= []).push({ id: r.id, name: r.name });
  return out;
}
