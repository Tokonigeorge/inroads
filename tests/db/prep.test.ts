import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/domain/dates";
import { lookUp } from "@/server/ai/features";
import type { Tx } from "@/server/db/with-user";
import { addGoalStep, dueGoalSteps, listGoalSteps, setGoalStepDone } from "@/server/repos/goal-steps";
import { createGoal } from "@/server/repos/goals";
import { createPerson } from "@/server/repos/people";
import { attachPrep, keepOpening, keepStakeholder, latestPrepId, loadPlan } from "@/server/repos/prep";
import { createRoom } from "@/server/repos/rooms";
import { listSpaces } from "@/server/repos/spaces";
import { radarDue } from "@/server/system/briefs";
import { fakeAnthropic, promptText } from "../fixtures/fake-anthropic";
import { connect, createUser, errorCode } from "./helpers";

process.env.ANTHROPIC_API_KEY ??= "test-key";
const TZ = "Africa/Lagos";
const TODAY = todayIn(TZ);
const ROOM_DAY = addDays(TODAY, 5);
const { sql, db, sys } = connect();
let user: { id: string };
let work: string;
let personal: string;
let goal: string;
let room: string;
const tunde = randomUUID();
afterAll(() => sql.end());
const as = <T>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

const plan = (when: Record<string, string>) => ({
  title: "Moonshot by TechCabal",
  kind: "event",
  overview: "Africa's tech conference.",
  facts: ["Two days in Lagos"],
  website: "https://moonshot.example",
  stakeholders: [
    { name: "Tunde Bakare", role: "Partner, Kestrel (panel speaker)", why: "Invests at pre-seed", url: "https://www.linkedin.com/in/tunde" },
    { name: "Adaeze Okafor", role: "Head of programmes, organiser", why: "Curates the investor lounge", url: "" },
    { name: "", role: "Investor relations lead", why: "Runs the investor list", url: "" },
  ],
  warmPaths: [],
  opportunities: [{ goal: "Raise a pre-seed round", idea: "Investor office hours on day two", firstMove: "Book an office-hours slot before it fills" }],
  playbook: ["Arrive for the morning keynote"],
  when,
  confidence: "high",
  verify: "",
  sources: [{ title: "Moonshot", url: "https://moonshot.example" }],
});

beforeAll(async () => {
  user = await createUser(sql, "Room Preparer");
  await sql`update auth.users set last_sign_in_at = now() where id = ${user.id}`;
  const spaces = await as((tx) => listSpaces(tx));
  work = spaces.find((s) => s.kind === "work")!.id;
  personal = spaces.find((s) => s.kind === "personal")!.id;
  const g = await as((tx) => createGoal(tx, user.id, { text: "Raise a pre-seed round", spaceId: work, type: "capital", priority: 1, weeklyTarget: 2, stages: null }));
  if (!g.ok) throw new Error(g.message);
  goal = g.data.id;
  const r = await as((tx) => createRoom(tx, user.id, { title: "Moonshot", spaceId: work, kind: "conference", startsOn: ROOM_DAY, tz: TZ, freq: "none" }));
  if (!r.ok) throw new Error(r.message);
  room = r.data.id;
  await as((tx) => createPerson(tx, user.id, { id: tunde, identity: { name: "Tunde Bakare" }, membership: { spaceId: work } }, TODAY));
});

describe("room prep", () => {
  it("a room's prep searches with what's saved about the room, keeps clean dates only, and is linked to it", async () => {
    const fake = fakeAnthropic(() => ({
      json: plan({
        startsOn: ROOM_DAY,
        endsOn: addDays(ROOM_DAY, 1),
        startTime: "9am",
        endTime: "17:00",
        timezone: "Mars/Olympus",
        venue: "Landmark Centre, Lagos",
        url: "not a url",
      }),
    }));
    const r = await lookUp({ client: fake.client, sys, db }, user.id, { spaceId: work, type: "event", q: "Moonshot", eventId: room });
    expect(promptText(fake.calls[0])).toContain("ROOM ON MY LIST: Moonshot");
    const [s] = await sql`select event_id, result from searches where id = ${r.searchId}`;
    expect(s.event_id).toBe(room);
    expect(s.result.when).toEqual({ startsOn: ROOM_DAY, endsOn: addDays(ROOM_DAY, 1), startTime: "", endTime: "17:00", timezone: "", venue: "Landmark Centre, Lagos", url: "" });
    expect(await as((tx) => latestPrepId(tx, room))).toBe(r.searchId);
  });

  it("refuses a room from another Space", async () => {
    const fake = fakeAnthropic(() => ({ json: plan({}) }));
    await expect(lookUp({ client: fake.client, sys, db }, user.id, { spaceId: personal, type: "event", q: "Moonshot", eventId: room })).rejects.toThrow("isn't in this Space");
    // The database refuses it too, whatever the app does.
    expect(
      await errorCode(
        as((tx) =>
          tx.execute(sql`insert into searches (user_id, space_id, type, query, result, event_id) values (${user.id}, ${personal}, 'event', 'x', '{}'::jsonb, ${room})` as never),
        ),
      ),
    ).not.toBe("no error");
  });

  it("a look-up from the Add a room form becomes the new room's prep once", async () => {
    const fake = fakeAnthropic(() => ({ json: plan({ startsOn: ROOM_DAY, endsOn: "", startTime: "", endTime: "", timezone: TZ, venue: "", url: "" }) }));
    const { searchId } = await lookUp({ client: fake.client, sys, db }, user.id, { spaceId: work, type: "event", q: "Moonshot 2026" });
    const other = await as((tx) => createRoom(tx, user.id, { title: "Moonshot day two", spaceId: work, kind: "conference", startsOn: ROOM_DAY, tz: TZ, freq: "none" }));
    if (!other.ok) throw new Error(other.message);
    await as((tx) => attachPrep(tx, searchId, other.data.id));
    await as((tx) => attachPrep(tx, searchId, room));
    expect(await as((tx) => latestPrepId(tx, other.data.id))).toBe(searchId);
  });
});

describe("plans become actions", () => {
  let searchId: string;
  beforeAll(async () => {
    searchId = (await as((tx) => latestPrepId(tx, room)))!;
  });

  it("keeping a named person reuses your contact, adds them to the goal and to the room as a speaker", async () => {
    const r = await as((tx) => keepStakeholder(tx, user.id, { searchId, index: 0, goalId: goal }, TODAY));
    expect(r).toEqual({ ok: true, data: { personId: tunde, created: false } });
    expect(await sql`select stage from goal_links where person_id = ${tunde} and goal_id = ${goal}`).toEqual([{ stage: "identified" }]);
    expect(await sql`select role from event_people where person_id = ${tunde} and event_id = ${room}`).toEqual([{ role: "speaker" }]);
  });

  it("someone new is saved with their role, profile and why, then linked; a role without a name can't be", async () => {
    const r = await as((tx) => keepStakeholder(tx, user.id, { searchId, index: 1, goalId: null }, TODAY));
    if (!r.ok) throw new Error(r.message);
    expect(r.data.created).toBe(true);
    const [p] = await sql`select p.name, p.position, ps.notes from people p join person_spaces ps on ps.person_id = p.id where p.id = ${r.data.personId}`;
    expect(p).toEqual({ name: "Adaeze Okafor", position: "Head of programmes, organiser", notes: "From your plan for Moonshot by TechCabal. Curates the investor lounge" });
    expect(await sql`select role from event_people where person_id = ${r.data.personId}`).toEqual([{ role: "organiser" }]);
    expect(await as((tx) => keepStakeholder(tx, user.id, { searchId, index: 2, goalId: goal }, TODAY))).toMatchObject({ ok: false });

    const kept = await as((tx) => loadPlan(tx, searchId));
    expect(Object.keys(kept!.keptPeople)).toEqual(["0", "1"]);
  });

  it("an opening becomes a step due the day before the room, and is marked kept", async () => {
    const r = await as((tx) => keepOpening(tx, user.id, { searchId, index: 0, goalId: goal }, TODAY));
    expect(r.ok).toBe(true);
    const steps = await as((tx) => listGoalSteps(tx, goal));
    expect(steps).toMatchObject([{ text: "Book an office-hours slot before it fills", dueOn: addDays(ROOM_DAY, -1), fromPrep: true }]);
    expect((await as((tx) => loadPlan(tx, searchId)))!.keptSteps).toEqual([0]);
  });
});

describe("goal steps", () => {
  it("are listed open first, show on Today when due, and drop off once done", async () => {
    const a = await as((tx) => addGoalStep(tx, user.id, { goalId: goal, text: "Send the deck to Tunde", dueOn: TODAY }));
    const b = await as((tx) => addGoalStep(tx, user.id, { goalId: goal, text: "Update the data room" }));
    if (!a.ok || !b.ok) throw new Error("step not added");
    expect((await as((tx) => listGoalSteps(tx, goal))).map((s) => s.text)).toEqual(["Send the deck to Tunde", "Book an office-hours slot before it fills", "Update the data room"]);
    expect((await as((tx) => dueGoalSteps(tx, TODAY, work))).map((s) => s.text)).toEqual(["Send the deck to Tunde"]);
    expect(await as((tx) => dueGoalSteps(tx, TODAY, personal))).toEqual([]);
    await as((tx) => setGoalStepDone(tx, a.data.id, true));
    expect(await as((tx) => dueGoalSteps(tx, TODAY, work))).toEqual([]);
    expect((await as((tx) => listGoalSteps(tx, goal))).at(-1)).toMatchObject({ text: "Send the deck to Tunde" });
  });

  it("refuse empty text and other people's goals", async () => {
    expect(await as((tx) => addGoalStep(tx, user.id, { goalId: goal, text: "  " }))).toMatchObject({ ok: false });
    const other = await createUser(sql, "Someone Else");
    expect(await db.withUser(other.id, (tx) => addGoalStep(tx, other.id, { goalId: goal, text: "Sneak in" }))).toMatchObject({ ok: false, message: "This goal no longer exists." });
  });
});

describe("weekly rooms for your goals", () => {
  it("are due at brief time for Spaces with goals, once a week", async () => {
    const [p] = await sql`select brief_time::text as t, timezone from profiles where user_id = ${user.id}`;
    const [h, m] = (p.t as string).split(":").map(Number);
    // The brief time today in the user's zone (Lagos is UTC+1 all year).
    const at = new Date(`${TODAY}T${String(h - 1).padStart(2, "0")}:${String(m + 5).padStart(2, "0")}:00Z`);
    const mine = (await radarDue(sys, at)).filter((r) => r.userId === user.id);
    expect(mine).toEqual([{ userId: user.id, spaceId: work }]);
    expect((await radarDue(sys, new Date(at.getTime() + 3 * 3600_000))).filter((r) => r.userId === user.id)).toEqual([]);
    await sql`insert into searches (user_id, space_id, type, query, result) values (${user.id}, ${work}, 'radar', 'x', '{"items":[]}'::jsonb)`;
    expect((await radarDue(sys, at)).filter((r) => r.userId === user.id)).toEqual([]);
  });
});
