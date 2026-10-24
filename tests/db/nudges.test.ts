import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/domain/dates";
import type { Tx } from "@/server/db/with-user";
import { clearNudgeState, listNudges, setNudgeState, todayAgenda } from "@/server/repos/nudges";
import { addPromise, createPerson, logTouch, saveMembership, setPersonArchived } from "@/server/repos/people";
import { createRoom, linkPerson } from "@/server/repos/rooms";
import { listSpaces } from "@/server/repos/spaces";
import { connect, createUser } from "./helpers";

const { sql, db } = connect();
const TZ = "Africa/Lagos";
const TODAY = todayIn(TZ);
let user: { id: string };
let work: string;
let dating: string;
const ids: Record<string, string> = {};
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);
const ctx = (spaceId: string | null = null) => ({ spaceId, today: TODAY, tz: TZ });
const keys = async (spaceId: string | null = null) => (await as((tx) => listNudges(tx, ctx(spaceId)))).map((n) => n.key);

async function person(key: string, name: string, spaceId: string, extra: { birthday?: string; whereMet?: string } = {}) {
  const id = randomUUID();
  const r = await as((tx) =>
    createPerson(tx, user.id, { id, identity: { name, birthday: extra.birthday ?? null }, membership: { spaceId, whereMet: extra.whereMet ?? "Lagos Startup Week" } }, TODAY),
  );
  if (!r.ok) throw new Error(r.message);
  ids[key] = id;
  return id;
}

beforeAll(async () => {
  user = await createUser(sql, "Nudge Owner");
  const spaces = await as((tx) => listSpaces(tx));
  work = spaces.find((s) => s.kind === "work")!.id;
  dating = spaces.find((s) => s.kind === "dating")!.id;

  // Due: last touch 40 days ago, Work's default reminder is monthly.
  await person("due", "Adaeze Okafor", work);
  await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: ids.due, spaceId: work, occurredOn: addDays(TODAY, -40), type: "coffee", summary: "Talked about the round" }));
  // Same, but waiting in import triage: no reminder until sorted.
  await person("pending", "Imported Person", work);
  await sql`update person_spaces set triage_state = 'pending' where person_id = ${ids.pending}`;
  await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: ids.pending, spaceId: work, occurredOn: addDays(TODAY, -90), type: "call" }));
  await sql`update person_spaces set triage_state = 'pending' where person_id = ${ids.pending}`;
  // Archived: never nudges.
  await person("archived", "Archived Person", work);
  await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: ids.archived, spaceId: work, occurredOn: addDays(TODAY, -90), type: "call" }));
  await as((tx) => setPersonArchived(tx, ids.archived, true));
  // Dating: due, but only in Dating or All.
  await person("dating", "Sade Lawal", dating);
  await sql`update person_spaces set cadence_days = 7 where person_id = ${ids.dating}`;
  await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: ids.dating, spaceId: dating, occurredOn: addDays(TODAY, -10), type: "message" }));

  await person("bday", "Kwame Mensah", work, { birthday: addDays(TODAY, 1).slice(5) });
  await person("ctx", "New Contact", work, { whereMet: "" });

  await person("promise", "Tunde Bakare", work);
  await as((tx) => addPromise(tx, user.id, { id: randomUUID(), personId: ids.promise, spaceId: work, text: "Send the pricing deck", owner: "me", dueOn: addDays(TODAY, -2) }));
  await as((tx) => addPromise(tx, user.id, { id: randomUUID(), personId: ids.promise, spaceId: work, text: "Share the RFP", owner: "them", dueOn: addDays(TODAY, -1) }));
  await as((tx) => addPromise(tx, user.id, { id: randomUUID(), personId: ids.promise, spaceId: work, text: "Later thing", owner: "me", dueOn: addDays(TODAY, 20) }));

  // A meetup tomorrow with Tunde linked, and a 1:1 meeting today with Adaeze.
  const meetup = await as((tx) => createRoom(tx, user.id, { title: "Founders Breakfast", spaceId: work, kind: "meetup", startsOn: addDays(TODAY, 1), startTime: "08:00", tz: TZ, freq: "none" }));
  const meeting = await as((tx) => createRoom(tx, user.id, { title: "Coffee with Adaeze", spaceId: work, kind: "meeting", startsOn: TODAY, startTime: "23:30", tz: TZ, freq: "none" }));
  if (!meetup.ok || !meeting.ok) throw new Error("rooms");
  ids.meetup = meetup.data.id;
  ids.meeting = meeting.data.id;
  await as((tx) => linkPerson(tx, user.id, ids.meetup, ids.promise, "attendee"));
  await as((tx) => linkPerson(tx, user.id, ids.meeting, ids.due, "attendee"));
});

describe("Today's reminders", () => {
  it("builds the feed from what's due, owed and coming up", async () => {
    const k = await keys();
    expect(k).toContain(`bday:${ids.bday}:${addDays(TODAY, 1)}`);
    expect(k.filter((x) => x.startsWith("p:"))).toHaveLength(1); // the later promise waits
    expect(k.some((x) => x.startsWith("them:"))).toBe(true);
    expect(k).toContain(`prep:${ids.promise}:${ids.meetup}:${addDays(TODAY, 1)}`);
    expect(k).toContain(`prep:${ids.due}:${ids.meeting}:${TODAY}`);
    expect(k).toContain(`ev:${ids.meetup}:${addDays(TODAY, 1)}`);
    expect(k).not.toContain(`ev:${ids.meeting}:${TODAY}`); // 1:1 meetings and today's rooms aren't "this week" cards
    expect(k).toContain(`ctx:${ids.ctx}`);
    expect(k.some((x) => x.startsWith(`due:${ids.dating}:`))).toBe(true);
    // Adaeze is due, but the meeting today is the sharper reason.
    expect(k.some((x) => x.startsWith(`due:${ids.due}:`))).toBe(false);
    expect(k.some((x) => x.includes(ids.pending) && !x.startsWith("triage"))).toBe(false);
    expect(k.some((x) => x.includes(ids.archived))).toBe(false);
    expect(k).toContain(`triage:${TODAY}`);
  });

  it("one Space at a time", async () => {
    const workKeys = await keys(work);
    expect(workKeys.some((x) => x.includes(ids.dating))).toBe(false);
    const datingKeys = await keys(dating);
    expect(datingKeys.some((x) => x.startsWith(`due:${ids.dating}:`))).toBe(true);
    expect(datingKeys.some((x) => x.includes(ids.promise))).toBe(false);
  });

  it("someone in two Spaces is due by their shortest reminder", async () => {
    await as((tx) => saveMembership(tx, user.id, ids.bday, { spaceId: dating }, TODAY));
    await sql`update person_spaces set cadence_days = 7, cadence_anchor_on = ${addDays(TODAY, -8)} where person_id = ${ids.bday} and space_id = ${dating}`;
    const all = await as((tx) => listNudges(tx, ctx()));
    // The birthday is the sharper reason in "All", so no separate "due" card.
    expect(all.filter((n) => n.person?.id === ids.bday).map((n) => n.kind)).toEqual(["birthday"]);
  });

  it("snooze and dismiss hide a card until they expire, and can be undone", async () => {
    const key = `ctx:${ids.ctx}`;
    await as((tx) => setNudgeState(tx, user.id, key, { type: "snooze", days: 3 }));
    expect(await keys()).not.toContain(key);
    await as((tx) => clearNudgeState(tx, key));
    expect(await keys()).toContain(key);
    await as((tx) => setNudgeState(tx, user.id, key, { type: "dismiss" }));
    expect(await keys()).not.toContain(key);
    // An expired snooze no longer hides anything.
    await sql`update nudge_states set snoozed_until = now() - interval '1 minute', dismissed_at = null where key = ${key}`;
    expect(await keys()).toContain(key);
  });

  it("other users' states don't leak", async () => {
    const other = await createUser(sql, "Nudge Stranger");
    expect(await db.withUser(other.id, (tx) => listNudges(tx, ctx()))).toEqual([]);
  });
});

describe("Today's agenda", () => {
  it("lists today's sessions with prep for each person", async () => {
    const agenda = await as((tx) => todayAgenda(tx, ctx()));
    const coffee = agenda.find((a) => a.eventId === ids.meeting)!;
    expect(coffee).toMatchObject({ title: "Coffee with Adaeze", time: "23:30" });
    expect(coffee.attendees).toEqual([{ id: ids.due, name: "Adaeze Okafor", detail: "", lastTouch: { on: addDays(TODAY, -40), summary: "Talked about the round" }, promise: null }]);
    expect(agenda.find((a) => a.eventId === ids.meetup)).toBeUndefined();
  });
});
