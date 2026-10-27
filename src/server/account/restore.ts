import "server-only";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { touchTypes } from "@/contracts/people";
import { roomKinds } from "@/contracts/rooms";
import { goalTypes } from "@/contracts/goals";
import { isIsoDate, type IsoDate } from "@/domain/dates";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";

/**
 * Restore from backup (prototype "Backup → Restore from backup", L2464–2476). Reads either this
 * app's export (`inroads-export.zip`, or its `inroads.json`) or the prototype's
 * `inroads-backup-….json`, and adds what's in it to your account. It only ever adds: people,
 * rooms, touches, promises and goals you already have (same id, or the same name for goals) are
 * left as they are, and the profile is filled only where yours is empty.
 */
export type RestoreResult = { people: number; events: number; touches: number; promises: number; goals: number };

export class RestoreError extends Error {}

type Row = Record<string, unknown>;
const arr = (x: unknown): Row[] => (Array.isArray(x) ? (x.filter((r) => r && typeof r === "object") as Row[]) : []);
const str = (x: unknown, max = 2000) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null);
const strs = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim().slice(0, 200)) : []);
const date = (x: unknown) => (typeof x === "string" && isIsoDate(x.slice(0, 10)) ? (x.slice(0, 10) as IsoDate) : null);
const time = (x: unknown) => (typeof x === "string" && /^\d{2}:\d{2}/.test(x) ? x.slice(0, 5) : null);
const pick = <T extends string>(x: unknown, allowed: readonly T[], fallback: T) => (allowed.includes(x as T) ? (x as T) : fallback);

/** The backup's JSON from an uploaded file: a zip (the app's export) or JSON (either format). */
export function readBackup(bytes: Uint8Array): Row {
  let text: string;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes, { filter: (f) => f.name === "inroads.json" });
    } catch {
      throw new RestoreError("That zip couldn't be opened.");
    }
    if (!files["inroads.json"]) throw new RestoreError("That zip isn't an Inroads backup (no inroads.json inside).");
    text = strFromU8(files["inroads.json"]);
  } else text = strFromU8(bytes);
  try {
    const d = JSON.parse(text) as unknown;
    if (!d || typeof d !== "object") throw new Error();
    return d as Row;
  } catch {
    throw new RestoreError("That file isn't a valid Inroads backup.");
  }
}

export async function restoreBackup(tx: Tx, userId: string, d: Row): Promise<RestoreResult> {
  if (d.format === "inroads-export") return restoreExport(tx, userId, d);
  if (d.app === "inroads") return restorePrototype(tx, userId, d);
  throw new RestoreError("That file isn't an Inroads backup.");
}

/** Ids from the backup that already exist in this account (restoring onto yourself adds nothing twice). */
async function existing(tx: Tx, table: typeof t.people | typeof t.events | typeof t.interactions | typeof t.commitments, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await tx.select({ id: table.id }).from(table).where(inArray(table.id, ids));
  return new Set(rows.map((r) => r.id));
}

async function fillProfile(tx: Tx, userId: string, p: Row | undefined) {
  if (!p) return;
  const [mine] = await tx.select().from(t.profiles).where(eq(t.profiles.userId, userId));
  if (!mine) return;
  const set: Partial<typeof t.profiles.$inferInsert> = {};
  if (!mine.name && str(p.name, 80)) set.name = str(p.name, 80)!;
  if (!mine.headline && str(p.headline, 120)) set.headline = str(p.headline, 120);
  if (!mine.location && str(p.location, 80)) set.location = str(p.location, 80);
  if (!mine.background && str(p.background)) set.background = str(p.background);
  if (!mine.offerings && str(p.offerings, 1000)) set.offerings = str(p.offerings, 1000);
  if (!(mine.industries ?? []).length && strs(p.industries).length) set.industries = strs(p.industries).slice(0, 10);
  if (Object.keys(set).length) await tx.update(t.profiles).set(set).where(eq(t.profiles.userId, userId));
}

/** Space ids in the backup → this account's Spaces: same name, else same kind, else the first. */
async function spaceMap(tx: Tx, backup: Row[]) {
  const mine = await tx.select({ id: t.spaces.id, name: t.spaces.name, kind: t.spaces.kind }).from(t.spaces).orderBy(t.spaces.position);
  if (!mine.length) throw new RestoreError("Your account has no Space to restore into.");
  const map = new Map<string, string>();
  for (const s of backup) {
    const id = String(s.id);
    const hit = mine.find((m) => m.name.toLowerCase() === String(s.name ?? "").toLowerCase()) ?? mine.find((m) => m.kind === s.kind) ?? mine[0];
    map.set(id, hit.id);
  }
  return { map, fallback: mine[0].id };
}

async function restoreExport(tx: Tx, userId: string, d: Row): Promise<RestoreResult> {
  await fillProfile(tx, userId, d.profile as Row | undefined);
  const { map: spaceOf, fallback } = await spaceMap(tx, arr(d.spaces));
  const space = (id: unknown) => spaceOf.get(String(id)) ?? fallback;

  const people = arr(d.people).filter((p) => !p.deletedAt && !p.mergedIntoId && str(p.name, 200));
  const events = arr(d.events).filter((e) => !e.deletedAt && str(e.title, 200) && date(e.startsOn));
  const [havePeople, haveEvents] = await Promise.all([existing(tx, t.people, people.map((p) => String(p.id))), existing(tx, t.events, events.map((e) => String(e.id)))]);
  // New ids for everything restored, so a backup from another account never collides.
  const personId = new Map<string, string>();
  for (const p of people) personId.set(String(p.id), havePeople.has(String(p.id)) ? String(p.id) : randomUUID());
  const eventId = new Map<string, string>();
  for (const e of events) eventId.set(String(e.id), haveEvents.has(String(e.id)) ? String(e.id) : randomUUID());
  const freshPeople = people.filter((p) => !havePeople.has(String(p.id)));
  const freshEvents = events.filter((e) => !haveEvents.has(String(e.id)));

  if (freshPeople.length)
    await tx.insert(t.people).values(
      freshPeople.map((p) => ({
        id: personId.get(String(p.id))!,
        userId,
        name: str(p.name, 200)!,
        emails: strs(p.emails),
        phones: strs(p.phones),
        company: str(p.company, 200),
        position: str(p.position, 200),
        city: str(p.city, 120),
        birthday: typeof p.birthday === "string" && /^\d{2}-\d{2}$/.test(p.birthday) ? p.birthday : null,
        socials: p.socials && typeof p.socials === "object" ? (p.socials as Record<string, string>) : {},
        source: "restore",
      })),
    );
  const freshIds = new Set(freshPeople.map((p) => String(p.id)));
  const memberships = arr(d.personSpaces).filter((m) => freshIds.has(String(m.personId)));
  if (memberships.length)
    await tx
      .insert(t.personSpaces)
      .values(
        memberships.map((m) => ({
          userId,
          personId: personId.get(String(m.personId))!,
          spaceId: space(m.spaceId),
          whereMet: str(m.whereMet, 200),
          metOn: date(m.metOn),
          interests: strs(m.interests),
          notes: str(m.notes, 5000),
          opportunities: str(m.opportunities, 2000),
          tags: strs(m.tags),
          starred: m.starred === true,
          cadenceDays: typeof m.cadenceDays === "number" ? m.cadenceDays : null,
          triageState: "done" as const,
        })),
      )
      .onConflictDoNothing();
  // Anyone restored without a membership still needs a Space to show up in.
  const withSpace = new Set(memberships.map((m) => String(m.personId)));
  const orphans = freshPeople.filter((p) => !withSpace.has(String(p.id)));
  if (orphans.length) await tx.insert(t.personSpaces).values(orphans.map((p) => ({ userId, personId: personId.get(String(p.id))!, spaceId: fallback, triageState: "done" as const }))).onConflictDoNothing();
  const spaceOfPerson = new Map<string, Set<string>>();
  for (const m of memberships) spaceOfPerson.set(String(m.personId), (spaceOfPerson.get(String(m.personId)) ?? new Set()).add(space(m.spaceId)));
  for (const p of orphans) spaceOfPerson.set(String(p.id), new Set([fallback]));
  const inSpace = (pid: unknown, sid: string) => spaceOfPerson.get(String(pid))?.has(sid) ?? false;

  if (freshEvents.length)
    await tx.insert(t.events).values(
      freshEvents.map((e) => ({
        id: eventId.get(String(e.id))!,
        userId,
        spaceId: space(e.spaceId),
        title: str(e.title, 200)!,
        kind: pick(e.kind, roomKinds, "other"),
        startsOn: date(e.startsOn)!,
        startTime: time(e.startTime),
        endTime: time(e.endTime),
        allDay: e.allDay === true,
        tz: str(e.tz, 64) ?? "UTC",
        location: str(e.location, 300),
        url: str(e.url, 2000),
        notes: str(e.notes, 5000),
        rrule: str(e.rrule, 500),
        untilOn: date(e.untilOn),
        source: "restore",
      })),
    );
  const freshEventIds = new Set(freshEvents.map((e) => String(e.id)));
  const links = arr(d.eventPeople).filter((l) => freshEventIds.has(String(l.eventId)) && freshIds.has(String(l.personId)));
  const roomSpace = new Map(freshEvents.map((e) => [String(e.id), space(e.spaceId)]));
  const okLinks = links.filter((l) => inSpace(l.personId, roomSpace.get(String(l.eventId))!));
  if (okLinks.length)
    await tx
      .insert(t.eventPeople)
      .values(okLinks.map((l) => ({ userId, eventId: eventId.get(String(l.eventId))!, personId: personId.get(String(l.personId))!, role: str(l.role, 40) ?? "attendee", occurrenceOn: date(l.occurrenceOn) })))
      .onConflictDoNothing();

  const touches = arr(d.interactions).filter((i) => freshIds.has(String(i.personId)) && date(i.occurredOn) && inSpace(i.personId, space(i.spaceId)));
  if (touches.length)
    await tx.insert(t.interactions).values(
      touches.map((i) => ({
        userId,
        personId: personId.get(String(i.personId))!,
        spaceId: space(i.spaceId),
        occurredOn: date(i.occurredOn)!,
        type: pick(i.type, touchTypes, "other"),
        summary: str(i.summary, 2000),
        source: "restore",
      })),
    );
  const promises = arr(d.commitments).filter((c) => freshIds.has(String(c.personId)) && str(c.text, 500) && inSpace(c.personId, space(c.spaceId)));
  if (promises.length)
    await tx.insert(t.commitments).values(
      promises.map((c) => ({
        userId,
        personId: personId.get(String(c.personId))!,
        spaceId: space(c.spaceId),
        text: str(c.text, 500)!,
        owner: c.owner === "them" ? ("them" as const) : ("me" as const),
        dueOn: date(c.dueOn),
        doneAt: typeof c.doneAt === "string" ? new Date(c.doneAt) : null,
        source: "restore",
      })),
    );

  const goals = await restoreGoals(
    tx,
    userId,
    arr(d.goals)
      .filter((g) => !g.archivedAt && str(g.text, 140))
      .map((g) => ({ id: String(g.id), text: str(g.text, 140)!, type: g.type, priority: g.priority, weeklyTarget: g.weeklyTarget, active: g.active !== false, spaceId: space(g.spaceId) })),
  );
  const goalLinks = arr(d.goalLinks).filter((l) => goals.has(String(l.goalId)) && freshIds.has(String(l.personId)));
  for (const l of goalLinks) {
    const g = goals.get(String(l.goalId))!;
    if (!inSpace(l.personId, g.spaceId)) continue;
    await tx.insert(t.goalLinks).values({ userId, goalId: g.id, personId: personId.get(String(l.personId))!, stage: str(l.stage, 60) ?? "identified" }).onConflictDoNothing();
  }

  return { people: freshPeople.length, events: freshEvents.length, touches: touches.length, promises: promises.length, goals: [...goals.values()].filter((g) => g.fresh).length };
}

/** Goals by text: one you already have (same text, same Space) is reused, not duplicated. */
async function restoreGoals(tx: Tx, userId: string, goals: { id: string; text: string; type: unknown; priority: unknown; weeklyTarget: unknown; active: boolean; spaceId: string }[]) {
  const mine = await tx.select({ id: t.goals.id, text: t.goals.text, spaceId: t.goals.spaceId }).from(t.goals);
  const out = new Map<string, { id: string; spaceId: string; fresh: boolean }>();
  for (const g of goals) {
    const hit = mine.find((m) => m.spaceId === g.spaceId && m.text.toLowerCase() === g.text.toLowerCase());
    if (hit) {
      out.set(g.id, { id: hit.id, spaceId: g.spaceId, fresh: false });
      continue;
    }
    const priority = typeof g.priority === "number" ? Math.min(3, Math.max(1, g.priority)) : g.priority === "high" ? 1 : g.priority === "low" ? 3 : 2;
    const weeklyTarget = typeof g.weeklyTarget === "number" ? Math.min(50, Math.max(1, Math.round(g.weeklyTarget))) : 3;
    const [row] = await tx
      .insert(t.goals)
      .values({ userId, spaceId: g.spaceId, text: g.text, type: pick(g.type, goalTypes, "other"), priority, weeklyTarget, active: g.active })
      .returning({ id: t.goals.id });
    mine.push({ id: row.id, text: g.text, spaceId: g.spaceId });
    out.set(g.id, { id: row.id, spaceId: g.spaceId, fresh: true });
  }
  return out;
}

/** The prototype's backup: `{app: "inroads", profile, contacts, events}`, everything into your first Space. */
async function restorePrototype(tx: Tx, userId: string, d: Row): Promise<RestoreResult> {
  const p = (d.profile ?? {}) as Row;
  await fillProfile(tx, userId, { ...p, industries: p.industries });
  const { fallback: spaceId } = await spaceMap(tx, []).catch(async () => ({ fallback: (await tx.select({ id: t.spaces.id }).from(t.spaces).limit(1))[0]?.id, map: new Map() }));
  if (!spaceId) throw new RestoreError("Your account has no Space to restore into.");
  const contacts = arr(d.contacts).filter((c) => c.id && str(c.name, 200));
  const events = arr(d.events).filter((e) => e.id && str(e.title, 200) && date(e.date));

  const goals = await restoreGoals(
    tx,
    userId,
    arr(p.goals)
      .filter((g) => str(g.text, 140))
      .map((g) => ({ id: String(g.id), text: str(g.text, 140)!, type: g.type, priority: g.priority, weeklyTarget: g.weeklyTarget, active: g.active !== false, spaceId })),
  );

  const personId = new Map<string, string>();
  let touches = 0;
  let promises = 0;
  for (const c of contacts) {
    const id = randomUUID();
    personId.set(String(c.id), id);
    await tx.insert(t.people).values({
      id,
      userId,
      name: str(c.name, 200)!,
      emails: [str(c.email, 200)].filter((x): x is string => Boolean(x)),
      phones: [str(c.phone, 60)].filter((x): x is string => Boolean(x)),
      company: str(c.company, 200),
      position: str(c.position, 200),
      city: str(c.city, 120),
      birthday: typeof c.birthday === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.birthday) ? c.birthday.slice(5) : null,
      socials: c.socials && typeof c.socials === "object" ? (c.socials as Record<string, string>) : {},
      source: "restore",
    });
    await tx.insert(t.personSpaces).values({
      userId,
      personId: id,
      spaceId,
      whereMet: str(c.whereMet, 200),
      metOn: date(c.metOn),
      interests: strs(c.interests),
      notes: str(c.notes, 5000),
      opportunities: str(c.opportunities, 2000),
      tags: strs(c.tags),
      starred: c.starred === true,
      triageState: "done",
    });
    const its = arr(c.interactions).filter((i) => date(i.date));
    if (its.length) {
      await tx.insert(t.interactions).values(its.map((i) => ({ userId, personId: id, spaceId, occurredOn: date(i.date)!, type: pick(i.type, touchTypes, "other"), summary: str(i.summary, 2000), source: "restore" })));
      touches += its.length;
    }
    const cs = arr(c.commitments).filter((x) => str(x.text, 500));
    if (cs.length) {
      await tx.insert(t.commitments).values(
        cs.map((x) => ({ userId, personId: id, spaceId, text: str(x.text, 500)!, owner: x.owner === "them" ? ("them" as const) : ("me" as const), dueOn: date(x.due), doneAt: x.done === true ? new Date() : null, source: "restore" })),
      );
      promises += cs.length;
    }
    for (const gid of strs(c.goalIds)) {
      const g = goals.get(gid);
      if (g) await tx.insert(t.goalLinks).values({ userId, goalId: g.id, personId: id, stage: "identified" }).onConflictDoNothing();
    }
  }
  const recur: Record<string, string> = { weekly: "FREQ=WEEKLY", biweekly: "FREQ=WEEKLY;INTERVAL=2", monthly: "FREQ=MONTHLY", quarterly: "FREQ=MONTHLY;INTERVAL=3", yearly: "FREQ=YEARLY" };
  for (const e of events) {
    const [row] = await tx
      .insert(t.events)
      .values({
        userId,
        spaceId,
        title: str(e.title, 200)!,
        kind: pick(e.kind, roomKinds, "other"),
        startsOn: date(e.date)!,
        startTime: time(e.time),
        allDay: !time(e.time),
        tz: "UTC",
        location: str(e.location, 300),
        url: str(e.url, 2000),
        notes: str(e.notes, 5000),
        rrule: typeof e.recur === "string" ? (recur[e.recur] ?? null) : null,
        untilOn: date(e.until),
        source: "restore",
      })
      .returning({ id: t.events.id });
    const people = strs(e.contactIds)
      .map((cid) => personId.get(cid))
      .filter((x): x is string => Boolean(x));
    if (people.length) await tx.insert(t.eventPeople).values(people.map((pid) => ({ userId, eventId: row.id, personId: pid, role: "attendee" }))).onConflictDoNothing();
  }
  return { people: contacts.length, events: events.length, touches, promises, goals: [...goals.values()].filter((g) => g.fresh).length };
}
