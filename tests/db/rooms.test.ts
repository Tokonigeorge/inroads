import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { createPerson } from "@/server/repos/people";
import {
  createRoom,
  deleteRoom,
  getRoom,
  linkPerson,
  listPast,
  listSeries,
  listUpcoming,
  restoreRoom,
  roomsForPerson,
  setAttendance,
  unlinkPerson,
  updateRoom,
} from "@/server/repos/rooms";
import { listSpaces } from "@/server/repos/spaces";
import { connect, createUser } from "./helpers";

const { sql, db } = connect();
const TODAY = "2026-10-24"; // Saturday
let user: { id: string };
let work: string;
let dating: string;
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

beforeAll(async () => {
  user = await createUser(sql, "Rooms Owner");
  const spaces = await as((tx) => listSpaces(tx));
  work = spaces.find((s) => s.kind === "work")!.id;
  dating = spaces.find((s) => s.kind === "dating")!.id;
});

const base = { tz: "Africa/Lagos", kind: "meetup" as const };

describe("creating rooms", () => {
  it("stores repeats as an RRULE and reads them back", async () => {
    const r = await as((tx) =>
      createRoom(tx, user.id, { ...base, spaceId: work, title: "Founders Breakfast", startsOn: "2026-06-04", startTime: "08:00", freq: "monthly", nth: { n: 1, dow: 4 } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = await sql`select rrule, all_day, until_on from events where id = ${r.data.id}`;
    expect(row).toMatchObject({ rrule: "FREQ=MONTHLY;BYDAY=1TH", all_day: false, until_on: null });
    const room = (await as((tx) => getRoom(tx, r.data.id, TODAY)))!;
    expect(room.recurrence).toMatchObject({ freq: "monthly", nth: { n: 1, dow: 4 } });
    expect(room.next[0]).toBe("2026-11-05");
    expect(room.past.map((p) => p.date)).toEqual(["2026-10-01", "2026-09-03", "2026-08-06", "2026-07-02", "2026-06-04"]);
  });

  it("treats a room with no time as all day, and validates input", async () => {
    const r = await as((tx) => createRoom(tx, user.id, { ...base, spaceId: work, title: "Lagos Startup Week", startsOn: "2026-11-10", freq: "none" }));
    expect(r.ok).toBe(true);
    expect(await as((tx) => createRoom(tx, user.id, { ...base, spaceId: work, title: "", startsOn: "2026-11-10" }))).toMatchObject({ ok: false, field: "title" });
    expect(await as((tx) => createRoom(tx, user.id, { ...base, spaceId: work, title: "x", startsOn: "2026-11-10", tz: "Mars/Olympus" }))).toMatchObject({ ok: false, field: "tz" });
    expect(await as((tx) => createRoom(tx, user.id, { ...base, spaceId: work, title: "x", startsOn: "2026-11-10", freq: "weekly", untilOn: "2026-11-01" }))).toMatchObject({ ok: false, field: "untilOn" });
  });

  it("won't attach a goal from another Space", async () => {
    const [goal] = await sql`insert into goals (user_id, space_id, text) values (${user.id}, ${dating}, 'Meet someone kind') returning id`;
    const r = await as((tx) => createRoom(tx, user.id, { ...base, spaceId: work, title: "Mixer", startsOn: "2026-11-01", goalId: goal.id }));
    expect(r).toMatchObject({ ok: false, message: "That goal belongs to a different Space." });
  });
});

describe("lists", () => {
  it("shows upcoming sessions in the user's zone, series with attendance, and past one-offs", async () => {
    await sql`delete from events where user_id = ${user.id}`;
    const mk = async (input: Parameters<typeof createRoom>[2]) => {
      const r = await as((tx) => createRoom(tx, user.id, input));
      if (!r.ok) throw new Error(r.message);
      return r.data.id;
    };
    const weekly = await mk({ ...base, spaceId: work, title: "Run club", startsOn: "2026-09-05", startTime: "07:00", freq: "weekly" });
    await mk({ ...base, spaceId: work, title: "NY investor call", startsOn: "2026-10-26", startTime: "20:00", tz: "America/New_York" });
    await mk({ ...base, spaceId: work, title: "Old dinner", startsOn: "2026-09-12", startTime: "19:00" });
    await mk({ ...base, spaceId: dating, title: "Dinner date", startsOn: "2026-10-30", startTime: "19:30" });

    const upcoming = await as((tx) => listUpcoming(tx, work, TODAY, "Africa/Lagos", 10));
    expect(upcoming.map((u) => [u.title, u.date, u.time])).toEqual([
      ["Run club", "2026-10-24", "07:00"], // today is a Saturday
      ["NY investor call", "2026-10-27", "01:00"], // 8pm New York = 1am Lagos next day
      ["Run club", "2026-10-31", "07:00"],
    ]);
    expect(upcoming[1].localTimeLabel).toBe("8pm New York");
    expect((await as((tx) => listUpcoming(tx, null, TODAY, "Africa/Lagos", 10))).map((u) => u.title)).toContain("Dinner date");

    await as((tx) => setAttendance(tx, user.id, weekly, "2026-10-17", true));
    await as((tx) => setAttendance(tx, user.id, weekly, "2026-10-10", false));
    expect(await as((tx) => setAttendance(tx, user.id, weekly, "2026-10-18", true))).toMatchObject({ ok: false });
    const series = await as((tx) => listSeries(tx, work, TODAY));
    expect(series).toEqual([expect.objectContaining({ title: "Run club", next: "2026-10-24", pastCount: 6, attended: 1 })]);

    expect((await as((tx) => listPast(tx, work, TODAY))).map((p) => p.title)).toEqual(["Old dinner"]);
  });
});

describe("people in rooms", () => {
  it("links people from the room's Space only, and lists rooms on the person", async () => {
    const pid = randomUUID();
    await as((tx) => createPerson(tx, user.id, { id: pid, identity: { name: "Kemi" }, membership: { spaceId: work } }, TODAY));
    const r = await as((tx) => createRoom(tx, user.id, { ...base, spaceId: work, title: "Fintech mixer", startsOn: "2026-11-02", startTime: "18:00" }));
    const d = await as((tx) => createRoom(tx, user.id, { ...base, spaceId: dating, title: "Concert", startsOn: "2026-11-03" }));
    if (!r.ok || !d.ok) throw new Error("setup");

    expect(await as((tx) => linkPerson(tx, user.id, r.data.id, pid, "attendee"))).toEqual({ ok: true, data: null });
    expect(await as((tx) => linkPerson(tx, user.id, r.data.id, pid, "speaker"))).toEqual({ ok: true, data: null });
    expect(await as((tx) => linkPerson(tx, user.id, d.data.id, pid, "attendee"))).toMatchObject({ ok: false, message: expect.stringContaining("not in this room's Space") });

    const room = (await as((tx) => getRoom(tx, r.data.id, TODAY)))!;
    expect(room.people.map((p) => p.role).sort()).toEqual(["attendee", "speaker"]);
    expect(await as((tx) => roomsForPerson(tx, pid, TODAY))).toEqual([
      expect.objectContaining({ title: "Fintech mixer", role: "attendee", next: "2026-11-02" }),
      expect.objectContaining({ title: "Fintech mixer", role: "speaker" }),
    ]);

    // Moving a room with people to another Space is refused; unlinking first allows it.
    const move = { ...base, spaceId: dating, title: "Fintech mixer", startsOn: "2026-11-02" };
    expect(await as((tx) => updateRoom(tx, r.data.id, move))).toMatchObject({ ok: false, field: "spaceId" });
    await as((tx) => unlinkPerson(tx, r.data.id, pid, "attendee"));
    await as((tx) => unlinkPerson(tx, r.data.id, pid, "speaker"));
    expect(await as((tx) => updateRoom(tx, r.data.id, move))).toEqual({ ok: true, data: null });
  });

  it("deletes with undo", async () => {
    const r = await as((tx) => createRoom(tx, user.id, { ...base, spaceId: work, title: "To delete", startsOn: "2026-11-02" }));
    if (!r.ok) throw new Error();
    await as((tx) => deleteRoom(tx, r.data.id));
    expect(await as((tx) => getRoom(tx, r.data.id, TODAY))).toBeNull();
    await as((tx) => restoreRoom(tx, r.data.id));
    expect(await as((tx) => getRoom(tx, r.data.id, TODAY))).not.toBeNull();
  });

  it("is invisible to other accounts", async () => {
    const other = await createUser(sql, "Other");
    const [room] = await sql`select id from events where user_id = ${user.id} limit 1`;
    expect(await db.withUser(other.id, (tx) => getRoom(tx, room.id, TODAY))).toBeNull();
    const r = await db.withUser(other.id, (tx) => setAttendance(tx, other.id, room.id, TODAY, true));
    expect(r.ok).toBe(false);
    void t;
  });
});
