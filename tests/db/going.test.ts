import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Tx } from "@/server/db/with-user";
import { listNudges, todayAgenda, upcomingAttendees } from "@/server/repos/nudges";
import { createRoom, linkPerson, roomsToDebrief, setGoing } from "@/server/repos/rooms";
import { createPerson } from "@/server/repos/people";
import { listSpaces } from "@/server/repos/spaces";
import { sendDueNotifications, type Sender } from "@/server/system/notify";
import { connect, createUser } from "./helpers";
import { randomUUID } from "node:crypto";

const { sql, db } = connect();
const sys = db.unsafeSystem;
const TODAY = "2026-11-02";
const TZ = "Africa/Lagos";
let user: { id: string };
let work: string;
let mixer: string;
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);
const ctx = () => ({ spaceId: null, today: TODAY, tz: TZ });

beforeAll(async () => {
  user = await createUser(sql, "Going Person");
  await sql`update profiles set timezone = ${TZ} where user_id = ${user.id}`;
  work = (await as((tx) => listSpaces(tx))).find((s) => s.kind === "work")!.id;
  // Saved from a suggestion, not going yet: today 15:00–17:00, with someone linked.
  const r = await as((tx) => createRoom(tx, user.id, { title: "Lagos Fintech Mixer", spaceId: work, kind: "mixer", startsOn: TODAY, startTime: "15:00", endTime: "17:00", tz: TZ, freq: "none", going: false }));
  if (!r.ok) throw new Error(r.message);
  mixer = r.data.id;
  const pid = randomUUID();
  await as((tx) => createPerson(tx, user.id, { id: pid, identity: { name: "Kemi Mixer" }, membership: { spaceId: work } }, TODAY));
  await as((tx) => linkPerson(tx, user.id, mixer, pid, "attendee"));
  await sql`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (${user.id}, 'https://push.example/going', 'k', 'a')`;
});

function sender() {
  const sent: string[] = [];
  const send: Sender = async (_s, payload) => void sent.push(JSON.parse(payload).title);
  return { sent, send };
}

describe("I'm going", () => {
  it("a saved event you're not going to gets no agenda, prep, research or 'how did it go?', and Today asks", async () => {
    expect(await as((tx) => todayAgenda(tx, ctx()))).toEqual([]);
    expect(await as((tx) => upcomingAttendees(tx, ctx(), 2))).toEqual([]);
    const nudges = await as((tx) => listNudges(tx, { ...ctx(), today: "2026-11-01" }));
    const ask = nudges.find((n) => n.title === "Going to Lagos Fintech Mixer?");
    expect(ask?.actions.map((a) => a.type)).toContain("going");
    expect(nudges.some((n) => n.title.startsWith("You meet Kemi"))).toBe(false);
    const f = sender();
    await sendDueNotifications(new Date("2026-11-02T16:05:00Z"), { sys, db, send: f.send });
    expect(f.sent.filter((t) => t.includes("Lagos Fintech Mixer"))).toEqual([]);
    expect(await as((tx) => roomsToDebrief(tx, null, "2026-11-03", TZ))).toEqual([]);
  });

  it("once you're going, all of it follows", async () => {
    expect(await as((tx) => setGoing(tx, mixer, true))).toBe(true);
    expect(await as((tx) => setGoing(tx, mixer, true))).toBe(false); // already going
    expect((await as((tx) => todayAgenda(tx, ctx()))).map((a) => a.title)).toEqual(["Lagos Fintech Mixer"]);
    expect((await as((tx) => upcomingAttendees(tx, ctx(), 2))).map((p) => p.name)).toEqual(["Kemi Mixer"]);
    await sql`delete from notification_log where user_id = ${user.id}`;
    const f = sender();
    await sendDueNotifications(new Date("2026-11-02T16:05:00Z"), { sys, db, send: f.send });
    expect(f.sent).toContain("How did Lagos Fintech Mixer go?");
    expect((await as((tx) => roomsToDebrief(tx, null, "2026-11-03", TZ))).map((r) => r.title)).toEqual(["Lagos Fintech Mixer"]);
  });
});
