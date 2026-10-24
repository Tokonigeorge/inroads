import "server-only";
import { randomUUID } from "node:crypto";
import { isNull } from "drizzle-orm";
import { addDays } from "@/domain/dates";
import { nameKey } from "@/domain/normalise";
import { fromRRule, occurrences, toRRule } from "@/domain/recurrence";
import type { IcsEvent } from "@/importers/ics";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import type { ImportContext } from "./contacts";

export type CalendarSummary = { events: number; skipped: number; logged: number; peopleTouched: number; newPeople: number; rooms: number };

const PAST_DAYS = 183;
const FUTURE_DAYS = 92;
/** Meetings bigger than this don't create new people (all-hands, webinars). */
const MAX_GUESTS_FOR_NEW_PEOPLE = 12;
const MAX_NEW_PEOPLE = 200;

/**
 * Calendar import, ported from the prototype's importCalendars():
 *  - past meetings (last 6 months) are logged as touches on the people who were there;
 *  - guests you don't have yet become people waiting to be sorted, with those touches;
 *  - upcoming meetings with other people become rooms, linked to the people you know.
 * Declined, cancelled and moved single sessions are skipped. Re-running is safe: touches are
 * keyed by event and date, rooms by the calendar's event id.
 */
export async function applyCalendar(
  tx: Tx,
  ctx: ImportContext & { meEmails: string[]; connectionId: string | null },
  events: IcsEvent[],
): Promise<CalendarSummary> {
  const me = new Set(ctx.meEmails.map((e) => e.toLowerCase()));
  const from = addDays(ctx.today, -PAST_DAYS);
  const to = addDays(ctx.today, FUTURE_DAYS);

  const people = await tx.select({ id: t.people.id, emails: t.people.emails }).from(t.people).where(isNull(t.people.deletedAt));
  const idByEmail = new Map<string, string>();
  for (const p of people) for (const e of p.emails) idByEmail.set(e.toLowerCase(), p.id);
  const memberships = await tx.select({ personId: t.personSpaces.personId, spaceId: t.personSpaces.spaceId }).from(t.personSpaces);
  const spacesOf = new Map<string, string[]>();
  for (const m of memberships) spacesOf.set(m.personId, [...(spacesOf.get(m.personId) ?? []), m.spaceId]);
  const spaceFor = (personId: string) => {
    const s = spacesOf.get(personId) ?? [];
    return s.includes(ctx.spaceId) ? ctx.spaceId : s[0];
  };

  const touches: (typeof t.interactions.$inferInsert)[] = [];
  const newPeople = new Map<string, { name: string; email: string; meetings: { date: string; summary: string; key: string }[]; first: string }>();
  const rooms: { row: typeof t.events.$inferInsert; people: string[]; attended: string[] }[] = [];
  let skipped = 0;

  for (const ev of events) {
    if (ev.status === "CANCELLED" || ev.isException) {
      skipped++;
      continue;
    }
    const mine = ev.attendees.find((a) => a.email && me.has(a.email) && a.role === "ATTENDEE");
    if (mine?.status === "DECLINED") {
      skipped++;
      continue;
    }
    const rec = fromRRule(ev.rrule, ev.start.date);
    const series = { start: ev.start.date, ...rec };
    const past = occurrences(series, from, addDays(ctx.today, -1));
    const next = occurrences(series, ctx.today, to);
    if (!past.length && !next.length) {
      skipped++;
      continue;
    }
    const seen = new Set<string>();
    const others = ev.attendees.filter((a) => {
      if (a.resource || (a.email && me.has(a.email))) return false;
      const k = a.email || nameKey(a.name);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const known = [...new Set(others.map((a) => (a.email ? idByEmail.get(a.email) : undefined)).filter((x): x is string => Boolean(x)))];
    const keyOf = (d: string) => `cal:${ev.uid || nameKey(ev.summary)}:${d}`;
    const summary = ev.summary || "Meeting";

    for (const d of past) {
      for (const pid of known) {
        const space = spaceFor(pid);
        if (space) touches.push({ userId: ctx.userId, personId: pid, spaceId: space, occurredOn: d, type: "meeting", summary, source: "calendar", dedupeKey: keyOf(d), importId: ctx.importId });
      }
      if (others.length <= MAX_GUESTS_FOR_NEW_PEOPLE) {
        for (const a of others) {
          if (!a.email || idByEmail.has(a.email)) continue;
          const np = newPeople.get(a.email) ?? { name: a.name || a.email.split("@")[0], email: a.email, meetings: [], first: summary };
          np.meetings.push({ date: d, summary, key: keyOf(d) });
          newPeople.set(a.email, np);
        }
      }
    }

    if (next.length && others.length) {
      const supported = !rec.unsupported;
      rooms.push({
        row: {
          userId: ctx.userId,
          spaceId: ctx.spaceId,
          title: summary.slice(0, 200),
          kind: "meeting",
          startsOn: ev.start.date,
          startTime: ev.start.time,
          allDay: ev.allDay,
          tz: ev.start.tz,
          location: ev.location || null,
          notes: ev.description || null,
          rrule: supported ? toRRule(rec) : null,
          rruleSource: supported ? null : ev.rrule,
          untilOn: rec.until ?? null,
          source: ctx.source,
          externalId: ev.uid || `${summary}:${ev.start.date}`,
          connectionId: ctx.connectionId,
          importId: ctx.importId,
        },
        people: known.filter((pid) => (spacesOf.get(pid) ?? []).includes(ctx.spaceId)),
        attended: rec.freq !== "none" && (mine?.status === "ACCEPTED" || ev.attendees.some((a) => a.role === "ORGANIZER" && me.has(a.email))) ? past : [],
      });
    }
  }

  // New people from meetings, busiest first.
  const fresh = [...newPeople.values()].sort((a, b) => b.meetings.length - a.meetings.length).slice(0, MAX_NEW_PEOPLE);
  for (const np of fresh) {
    const id = randomUUID();
    await tx.insert(t.people).values({ id, userId: ctx.userId, name: np.name.slice(0, 120), emails: [np.email], source: "calendar", importId: ctx.importId });
    await tx.insert(t.personSpaces).values({
      userId: ctx.userId,
      personId: id,
      spaceId: ctx.spaceId,
      whereMet: `Calendar: ${np.first}`.slice(0, 200),
      triageState: "pending",
      triageSuggestion: { starred: false, labels: [], hasName: np.name !== np.email.split("@")[0] },
      cadenceAnchorOn: ctx.today,
    });
    for (const m of np.meetings) touches.push({ userId: ctx.userId, personId: id, spaceId: ctx.spaceId, occurredOn: m.date, type: "meeting", summary: m.summary, source: "calendar", dedupeKey: m.key, importId: ctx.importId });
  }

  let logged = 0;
  for (let i = 0; i < touches.length; i += 500) {
    const inserted = await tx.insert(t.interactions).values(touches.slice(i, i + 500)).onConflictDoNothing().returning({ id: t.interactions.id });
    logged += inserted.length;
  }

  for (const r of rooms) {
    const [saved] = await tx
      .insert(t.events)
      .values(r.row)
      .onConflictDoUpdate({
        target: [t.events.userId, t.events.source, t.events.externalId],
        set: { title: r.row.title, startsOn: r.row.startsOn, startTime: r.row.startTime, allDay: r.row.allDay, tz: r.row.tz, location: r.row.location, rrule: r.row.rrule, rruleSource: r.row.rruleSource, untilOn: r.row.untilOn, deletedAt: null },
      })
      .returning({ id: t.events.id });
    if (r.people.length) {
      await tx.insert(t.eventPeople).values(r.people.map((personId) => ({ userId: ctx.userId, eventId: saved.id, personId, role: "attendee" }))).onConflictDoNothing();
    }
    if (r.attended.length) {
      await tx
        .insert(t.eventAttendance)
        .values(r.attended.map((d) => ({ userId: ctx.userId, eventId: saved.id, occurrenceOn: d, attended: true })))
        .onConflictDoNothing();
    }
  }

  return {
    events: events.length,
    skipped,
    logged,
    peopleTouched: new Set(touches.map((x) => x.personId)).size,
    newPeople: fresh.length,
    rooms: rooms.length,
  };
}
