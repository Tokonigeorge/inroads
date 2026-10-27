import "server-only";
import { firstIssue } from "@/contracts/issues";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { roomDebriefSchema, type RoomDebriefInput } from "@/contracts/rooms";
import { addDays, type IsoDate } from "@/domain/dates";
import { occurrences } from "@/domain/recurrence";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { addPromise, createPerson } from "./people";
import { timingOf } from "./rooms";
import type { Result } from "./spaces";

const fail = (message: string, field?: string): Result<never> => ({ ok: false, message, field });
const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;

/**
 * Saves "Who did you meet at X?" for one session: you went; each person is linked to the room as
 * met there (new people are added to the room's Space); each gets a touch dated that session and,
 * if you chose, a follow-up you owe in a day or two. Saving twice adds nothing new.
 */
export async function saveRoomDebrief(tx: Tx, userId: string, raw: RoomDebriefInput, today: IsoDate): Promise<Result<{ people: number; created: string[]; spaceId: string }>> {
  const parsed = roomDebriefSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error, "Check the details."));
  const d = parsed.data;
  const [e] = await tx.select().from(t.events).where(and(eq(t.events.id, d.eventId), isNull(t.events.deletedAt)));
  if (!e) return fail("This room no longer exists.");
  if (d.occurrenceOn > addDays(today, 1) || !occurrences(timingOf(e), d.occurrenceOn, d.occurrenceOn).length) return fail("That isn't a session of this room.");

  await tx
    .insert(t.eventAttendance)
    .values({ eventId: e.id, userId, occurrenceOn: d.occurrenceOn, attended: true })
    .onConflictDoUpdate({ target: [t.eventAttendance.eventId, t.eventAttendance.occurrenceOn], set: { attended: true } });

  let saved = 0;
  const created: string[] = [];
  for (const m of d.met) {
    let personId: string;
    let name: string;
    if ("personId" in m) {
      const [p] = await tx
        .select({ id: t.people.id, name: t.people.name })
        .from(t.people)
        .innerJoin(t.personSpaces, and(eq(t.personSpaces.personId, t.people.id), eq(t.personSpaces.spaceId, e.spaceId)))
        .where(and(eq(t.people.id, m.personId), isNull(t.people.deletedAt)));
      if (!p) return fail("Someone you picked isn't in this room's Space.");
      personId = p.id;
      name = p.name;
    } else {
      const r = await createPerson(tx, userId, { id: m.id, identity: { name: m.name, company: m.company }, membership: { spaceId: e.spaceId, whereMet: e.title, metOn: d.occurrenceOn } }, today);
      if (!r.ok) return r;
      personId = r.data.id;
      name = m.name;
      if (r.data.created) created.push(personId);
    }
    await tx.insert(t.eventPeople).values({ eventId: e.id, personId, userId, role: "met_there", occurrenceOn: d.occurrenceOn }).onConflictDoNothing();
    // One touch per person per session, whatever happens on a second save.
    const [touch] = await tx
      .insert(t.interactions)
      .values({ userId, personId, spaceId: e.spaceId, occurredOn: d.occurrenceOn, type: "event", summary: m.note ?? `Met at ${e.title}`, source: "manual", eventId: e.id, occurrenceOn: d.occurrenceOn, dedupeKey: `room:${e.id}:${d.occurrenceOn}` })
      .onConflictDoNothing()
      .returning({ id: t.interactions.id });
    if (touch && d.followUpInDays) {
      const r = await addPromise(tx, userId, { id: randomUUID(), personId, spaceId: e.spaceId, text: `Follow up with ${firstName(name)} (met at ${e.title})`, owner: "me", dueOn: addDays(today, d.followUpInDays) });
      if (!r.ok) return r;
    }
    await tx.update(t.personSpaces).set({ triageState: "done" }).where(and(eq(t.personSpaces.personId, personId), eq(t.personSpaces.spaceId, e.spaceId)));
    saved++;
  }
  return { ok: true, data: { people: saved, created, spaceId: e.spaceId } };
}

/** "I didn't go": records it so the card goes away. */
export async function skipRoomSession(tx: Tx, userId: string, eventId: string, occurrenceOn: IsoDate) {
  await tx
    .insert(t.eventAttendance)
    .values({ eventId, userId, occurrenceOn, attended: false })
    .onConflictDoUpdate({ target: [t.eventAttendance.eventId, t.eventAttendance.occurrenceOn], set: { attended: false } });
}
