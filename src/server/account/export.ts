import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { toCsv } from "@/domain/csv";
import { getSystemDb, db as appDb } from "@/server/db/client";
import * as t from "@/server/db/schema";
import type { Database, Db, Tx } from "@/server/db/with-user";
import { jobsStore } from "@/server/system/jobs";

export const EXPORT_DAYS = 7;
const EXPORT_VERSION = 1;

/**
 * Everything you've put into Inroads, read as you (RLS), as one zip: `inroads.json` with every
 * table, plus CSVs of people, touches, promises and rooms for spreadsheets. Connection secrets
 * are never included; staging rows, jobs and nudge states are left out as housekeeping.
 */
export async function buildExport(tx: Tx, now: Date = new Date()) {
  const [profile] = await tx.select().from(t.profiles);
  const [spaces, circles, goals, peopleRows, personSpaces, personLinks, events, eventPeople, eventAttendance, interactions, commitments, goalLinks, goalLinkHistory, dossiers, scores, searches, suggestions, briefs, imports, connections] =
    await Promise.all([
      tx.select().from(t.spaces).orderBy(asc(t.spaces.position)),
      tx.select().from(t.circles),
      tx.select().from(t.goals),
      tx.select().from(t.people).orderBy(asc(t.people.name)),
      tx.select().from(t.personSpaces),
      tx.select().from(t.personLinks),
      tx.select().from(t.events).orderBy(asc(t.events.startsOn)),
      tx.select().from(t.eventPeople),
      tx.select().from(t.eventAttendance),
      tx.select().from(t.interactions).orderBy(asc(t.interactions.occurredOn)),
      tx.select().from(t.commitments),
      tx.select().from(t.goalLinks),
      tx.select().from(t.goalLinkHistory),
      tx.select().from(t.dossiers),
      tx.select().from(t.scores),
      tx.select().from(t.searches),
      tx.select().from(t.suggestions),
      tx.select().from(t.briefs),
      tx.select().from(t.imports),
      tx
        .select({ id: t.connections.id, provider: t.connections.provider, accountEmail: t.connections.accountEmail, scopes: t.connections.scopes, status: t.connections.status, lastSyncedAt: t.connections.lastSyncedAt, createdAt: t.connections.createdAt })
        .from(t.connections),
    ]);
  // The search vector is derived from the other columns.
  const people = peopleRows.map((p) => {
    const { search, ...rest } = p;
    void search;
    return rest;
  });

  const json = {
    format: "inroads-export",
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    profile,
    spaces, circles, goals, people, personSpaces, personLinks, events, eventPeople, eventAttendance,
    interactions, commitments, goalLinks, goalLinkHistory, dossiers, scores, searches, suggestions, briefs, imports, connections,
  };

  const spaceName = new Map(spaces.map((s) => [s.id, s.name]));
  const live = new Map(people.filter((p) => !p.deletedAt && !p.mergedIntoId).map((p) => [p.id, p]));
  const personName = (id: string) => live.get(id)?.name ?? "";

  const peopleCsv = toCsv(
    ["Name", "Space", "Emails", "Phones", "Company", "Role", "City", "Birthday (MM-DD)", "Links", "Where you met", "Met on", "Tags", "Interests", "Notes", "Last touch"],
    personSpaces
      .filter((m) => live.has(m.personId))
      .map((m) => {
        const p = live.get(m.personId)!;
        return [p.name, spaceName.get(m.spaceId), p.emails, p.phones, p.company, p.position, p.city, p.birthday, Object.values((p.socials ?? {}) as Record<string, string>), m.whereMet, m.metOn, m.tags, m.interests, m.notes, m.lastTouchedOn];
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1]))),
  );
  const touchesCsv = toCsv(
    ["Date", "Person", "Space", "Type", "Summary"],
    interactions.filter((i) => live.has(i.personId)).map((i) => [i.occurredOn, personName(i.personId), spaceName.get(i.spaceId), i.type, i.summary]),
  );
  const promisesCsv = toCsv(
    ["Person", "Space", "Promise", "Who owes it", "Due", "Done"],
    commitments.filter((c) => live.has(c.personId)).map((c) => [personName(c.personId), spaceName.get(c.spaceId), c.text, c.owner === "me" ? "You" : "Them", c.dueOn, c.doneAt?.toISOString().slice(0, 10)]),
  );
  const roomsCsv = toCsv(
    ["Title", "Space", "Starts on", "Start time", "End time", "Time zone", "Repeats (RRULE)", "Location", "Link", "Notes"],
    events.filter((e) => !e.deletedAt).map((e) => [e.title, spaceName.get(e.spaceId), e.startsOn, e.startTime, e.endTime, e.tz, e.rrule, e.location, e.url, e.notes]),
  );

  const stamp = now.toISOString().slice(0, 10);
  const bytes = zipSync(
    {
      "inroads.json": strToU8(JSON.stringify(json, null, 2)),
      "people.csv": strToU8(peopleCsv),
      "touches.csv": strToU8(touchesCsv),
      "promises.csv": strToU8(promisesCsv),
      "rooms.csv": strToU8(roomsCsv),
    },
    { level: 6 },
  );
  return { filename: `inroads-export-${stamp}.zip`, bytes, counts: { people: live.size, rooms: roomsCsv.split("\r\n").length - 2, touches: interactions.length } };
}

/** The export job: builds the zip as the user, keeps only the newest one, records it on the job. */
export async function runExport(userId: string, jobId: string, deps: { db?: Pick<Db, "withUser">; sys?: Database } = {}) {
  const jobs = jobsStore(deps.sys);
  const sys = deps.sys ?? getSystemDb();
  try {
    await jobs.progress(jobId, { step: "Gathering your data" });
    const out = await (deps.db ?? appDb).withUser(userId, (tx) => buildExport(tx));
    await jobs.progress(jobId, { step: "Packing the file" });
    const [row] = await sys.transaction(async (tx) => {
      await tx.delete(t.dataExports).where(eq(t.dataExports.userId, userId));
      return tx
        .insert(t.dataExports)
        .values({ userId, jobId, filename: out.filename, sizeBytes: out.bytes.byteLength, data: Buffer.from(out.bytes), expiresAt: new Date(Date.now() + EXPORT_DAYS * 86_400_000) })
        .returning({ id: t.dataExports.id });
    });
    await jobs.done(jobId, { step: "Ready" }, { exportId: row.id, ...out.counts });
    return row.id;
  } catch (e) {
    await jobs.fail(jobId, "The export didn't finish. Try again.");
    throw e;
  }
}

/** The newest export you can still download, without its bytes. */
export async function latestExport(tx: Tx) {
  const [row] = await tx
    .select({ id: t.dataExports.id, filename: t.dataExports.filename, sizeBytes: t.dataExports.sizeBytes, createdAt: t.dataExports.createdAt, expiresAt: t.dataExports.expiresAt })
    .from(t.dataExports)
    .orderBy(desc(t.dataExports.createdAt))
    .limit(1);
  return row && row.expiresAt > new Date() ? row : null;
}

export async function readExport(tx: Tx, id: string) {
  const [row] = await tx.select().from(t.dataExports).where(eq(t.dataExports.id, id));
  return row && row.expiresAt > new Date() ? row : null;
}

