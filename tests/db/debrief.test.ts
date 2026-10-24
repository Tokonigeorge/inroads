import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/domain/dates";
import type { Tx } from "@/server/db/with-user";
import { saveRoomDebrief, skipRoomSession } from "@/server/repos/debrief";
import { listNudges } from "@/server/repos/nudges";
import { createPerson } from "@/server/repos/people";
import { createRoom, linkPerson, roomsToDebrief } from "@/server/repos/rooms";
import { listSpaces } from "@/server/repos/spaces";
import { connect, createUser } from "./helpers";

const TZ = "Africa/Lagos";
const TODAY = todayIn(TZ);
const YESTERDAY = addDays(TODAY, -1);
const { sql, db } = connect();
let user: { id: string };
let work: string;
let personal: string;
let mixer: string;
const ada = randomUUID();
const sade = randomUUID();
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

beforeAll(async () => {
  user = await createUser(sql, "Room Debriefer");
  const spaces = await as((tx) => listSpaces(tx));
  work = spaces.find((s) => s.kind === "work")!.id;
  personal = spaces.find((s) => s.kind === "personal")!.id;
  await as((tx) => createPerson(tx, user.id, { id: ada, identity: { name: "Ada Obi" }, membership: { spaceId: work } }, TODAY));
  await as((tx) => createPerson(tx, user.id, { id: sade, identity: { name: "Sade Lawal" }, membership: { spaceId: personal } }, TODAY));
  const r = await as((tx) => createRoom(tx, user.id, { title: "Ikoyi Founders Mixer", spaceId: work, kind: "mixer", startsOn: YESTERDAY, startTime: "18:00", tz: TZ, freq: "none" }));
  if (!r.ok) throw new Error(r.message);
  mixer = r.data.id;
  await as((tx) => linkPerson(tx, user.id, mixer, ada, "attendee"));
  // A 1:1 meeting yesterday doesn't get a "who did you meet" card.
  await as((tx) => createRoom(tx, user.id, { title: "Coffee with Ada", spaceId: work, kind: "meeting", startsOn: YESTERDAY, tz: TZ, freq: "none" }));
});

describe("after the room", () => {
  it("shows a card for yesterday's room until you record it", async () => {
    expect(await as((tx) => roomsToDebrief(tx, null, TODAY, TZ))).toEqual([{ eventId: mixer, title: "Ikoyi Founders Mixer", date: YESTERDAY, occurrenceOn: YESTERDAY, people: 1 }]);
    const nudges = await as((tx) => listNudges(tx, { spaceId: null, today: TODAY, tz: TZ }));
    expect(nudges.find((n) => n.kind === "after_room")?.key).toBe(`after:${mixer}:${YESTERDAY}`);
    // Not in another Space's view.
    expect(await as((tx) => roomsToDebrief(tx, personal, TODAY, TZ))).toEqual([]);
  });

  it("saves who you met: attendance, met there, a touch each and follow-ups; saving again adds nothing", async () => {
    const input = { eventId: mixer, occurrenceOn: YESTERDAY, followUpInDays: 2 as const, met: [{ personId: ada, note: "Talked pricing" }, { id: randomUUID(), name: "Tola Adeyemi", company: "Kuda" }] };
    const r = await as((tx) => saveRoomDebrief(tx, user.id, input, TODAY));
    expect(r).toEqual({ ok: true, data: { people: 2 } });
    const again = await as((tx) => saveRoomDebrief(tx, user.id, input, TODAY));
    expect(again.ok).toBe(true);

    const [tola] = await sql`select p.id, p.company, ps.where_met, ps.met_on::text from people p join person_spaces ps on ps.person_id = p.id where p.user_id = ${user.id} and p.name = 'Tola Adeyemi'`;
    expect(tola).toMatchObject({ company: "Kuda", where_met: "Ikoyi Founders Mixer", met_on: YESTERDAY });
    expect(await sql`select id from people where user_id = ${user.id} and name = 'Tola Adeyemi'`).toHaveLength(1);

    expect(await sql`select attended from event_attendance where event_id = ${mixer}`).toEqual([{ attended: true }]);
    const metThere = await sql`select person_id from event_people where event_id = ${mixer} and role = 'met_there'`;
    expect(metThere.map((m) => m.person_id)).toEqual(expect.arrayContaining([ada, tola.id]));
    const touches = await sql`select person_id, type, summary, occurred_on::text from interactions where event_id = ${mixer} and person_id = ${ada}`;
    expect(touches).toEqual([{ person_id: ada, type: "event", summary: "Talked pricing", occurred_on: YESTERDAY }]);
    const follow = await sql`select text, owner, due_on::text from commitments where person_id = ${ada}`;
    expect(follow).toEqual([{ text: "Follow up with Ada (met at Ikoyi Founders Mixer)", owner: "me", due_on: addDays(TODAY, 2) }]);
    const [{ last }] = await sql`select last_touched_on::text as last from people where id = ${ada}`;
    expect(last).toBe(YESTERDAY);

    expect(await as((tx) => roomsToDebrief(tx, null, TODAY, TZ))).toEqual([]);
  });

  it("refuses people from another Space and dates that aren't sessions", async () => {
    expect(await as((tx) => saveRoomDebrief(tx, user.id, { eventId: mixer, occurrenceOn: YESTERDAY, followUpInDays: 0, met: [{ personId: sade }] }, TODAY))).toMatchObject({ ok: false });
    expect(await as((tx) => saveRoomDebrief(tx, user.id, { eventId: mixer, occurrenceOn: addDays(TODAY, -5), followUpInDays: 0, met: [] }, TODAY))).toMatchObject({ ok: false, message: "That isn't a session of this room." });
  });

  it("\"I didn't go\" records it and the card goes away", async () => {
    const r = await as((tx) => createRoom(tx, user.id, { title: "Demo Day", spaceId: work, kind: "conference", startsOn: addDays(TODAY, -2), tz: TZ, freq: "none" }));
    if (!r.ok) throw new Error(r.message);
    expect((await as((tx) => roomsToDebrief(tx, null, TODAY, TZ))).map((x) => x.title)).toEqual(["Demo Day"]);
    await as((tx) => skipRoomSession(tx, user.id, r.data.id, addDays(TODAY, -2)));
    expect(await as((tx) => roomsToDebrief(tx, null, TODAY, TZ))).toEqual([]);
    expect(await sql`select attended from event_attendance where event_id = ${r.data.id}`).toEqual([{ attended: false }]);
  });
});
