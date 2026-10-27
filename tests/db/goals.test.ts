import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/domain/dates";
import { weekOf } from "@/domain/goal-progress";
import type { Tx } from "@/server/db/with-user";
import { createGoal, deleteGoal, getGoal, goalHistory, goalOptionsForPerson, linkPeople, listGoals, moveStage, restoreLink, setGoalState, unlinkPerson, updateGoal } from "@/server/repos/goals";
import { createPerson, logTouch, saveMembership } from "@/server/repos/people";
import { createRoom, setAttendance } from "@/server/repos/rooms";
import { listSpaces, updateSpace } from "@/server/repos/spaces";
import { connect, createUser } from "./helpers";

const { sql, db } = connect();
const TZ = "Africa/Lagos";
// History rows are stamped with the real clock, so the tests use the real "today".
const TODAY = todayIn(TZ);
const week = weekOf(TODAY);
let user: { id: string };
let work: string;
let dating: string;
const people: Record<string, string> = {};
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

beforeAll(async () => {
  user = await createUser(sql, "Goals Owner");
  const spaces = await as((tx) => listSpaces(tx));
  work = spaces.find((s) => s.kind === "work")!.id;
  dating = spaces.find((s) => s.kind === "dating")!.id;
  for (const [key, name, spaceId] of [
    ["adaeze", "Adaeze Okafor", work],
    ["kwame", "Kwame Mensah", work],
    ["tunde", "Tunde Bakare", work],
    ["sade", "Sade Lawal", dating],
  ] as const) {
    const id = randomUUID();
    await as((tx) => createPerson(tx, user.id, { id, identity: { name }, membership: { spaceId } }, TODAY));
    people[key] = id;
  }
});

const base = { type: "capital" as const, priority: 1, weeklyTarget: 3, stages: null };

describe("goals", () => {
  let goalId: string;

  it("creates a goal that uses its Space's stages, and validates input", async () => {
    const r = await as((tx) => createGoal(tx, user.id, { ...base, text: "Raise a pre-seed round", spaceId: work }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    goalId = r.data.id;
    const g = (await as((tx) => getGoal(tx, goalId, TODAY, TZ)))!;
    expect(g.customStages).toBe(false);
    expect(g.stages.map((s) => s.key)).toEqual(["identified", "warm_path", "introduced", "met", "in_conversation", "won", "closed"]);
    expect(await as((tx) => createGoal(tx, user.id, { ...base, text: "x", spaceId: work }))).toMatchObject({ ok: false, field: "text" });
    expect(await as((tx) => createGoal(tx, user.id, { ...base, text: "Valid text", spaceId: work, weeklyTarget: 0 }))).toMatchObject({ ok: false, field: "weeklyTarget" });
  });

  it("adds people only by explicit action, at the first open stage, and only from the goal's Space", async () => {
    const r = await as((tx) => linkPeople(tx, user.id, goalId, [people.adaeze, people.kwame]));
    expect(r).toMatchObject({ ok: true, data: { added: 2 } });
    const again = await as((tx) => linkPeople(tx, user.id, goalId, [people.adaeze]));
    expect(again).toMatchObject({ ok: true, data: { added: 0 } });
    // Sade is only in Dating: the database refuses, and the message says why.
    expect(await as((tx) => linkPeople(tx, user.id, goalId, [people.sade]))).toMatchObject({ ok: false, message: expect.stringContaining("not in this goal's Space") });
    expect(await as((tx) => linkPeople(tx, user.id, goalId, [people.tunde], "nope"))).toMatchObject({ ok: false, field: "stage" });
    const g = (await as((tx) => getGoal(tx, goalId, TODAY, TZ)))!;
    expect(g.pipeline.map((p) => [p.name, p.stage]).sort()).toEqual([
      ["Adaeze Okafor", "identified"],
      ["Kwame Mensah", "identified"],
    ]);
  });

  it("records stage moves, and counts this week's touches, rooms and moves", async () => {
    const g0 = (await as((tx) => getGoal(tx, goalId, TODAY, TZ)))!;
    const ada = g0.pipeline.find((p) => p.name === "Adaeze Okafor")!;
    expect(await as((tx) => moveStage(tx, ada.linkId, "met"))).toEqual({ ok: true, data: null });
    expect(await as((tx) => moveStage(tx, ada.linkId, "won"))).toEqual({ ok: true, data: null });
    expect(await as((tx) => moveStage(tx, ada.linkId, "not_a_stage"))).toMatchObject({ ok: false });

    // Two touches with Adaeze and one with Kwame this week; one last week; one with Tunde (not on the goal).
    for (const [p, d] of [
      [people.adaeze, week.start],
      [people.adaeze, TODAY],
      [people.kwame, TODAY],
      [people.adaeze, addDays(week.start, -1)],
      [people.tunde, TODAY],
    ] as const) {
      await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: p, spaceId: work, occurredOn: d, type: "coffee" }));
    }
    const room = await as((tx) => createRoom(tx, user.id, { title: "Founders Breakfast", spaceId: work, startsOn: week.start, tz: TZ, kind: "meetup", freq: "weekly", goalId }));
    if (!room.ok) throw new Error(room.message);
    await as((tx) => setAttendance(tx, user.id, room.data.id, week.start, true));

    const g = (await as((tx) => getGoal(tx, goalId, TODAY, TZ)))!;
    expect(g.progress).toEqual({ touches: 3, peopleTouched: 2, rooms: 1, moves: { forward: 1, back: 0, won: 1, closed: 0 }, target: 3 });
    expect(g.counts).toEqual({ won: 1, identified: 1 });
    expect(g.rooms.map((r) => r.title)).toEqual(["Founders Breakfast"]);
    expect(g.recent[0]).toMatchObject({ name: "Adaeze Okafor", from: "met", to: "won" });

    const list = await as((tx) => listGoals(tx, { spaceId: null, today: TODAY, tz: TZ }));
    expect(list.find((x) => x.id === goalId)).toMatchObject({ people: 2, progress: { touches: 3, rooms: 1 } });
  });

  it("history: the meter, week by week, this week last", async () => {
    const h = await as((tx) => goalHistory(tx, { id: goalId, spaceId: work }, TODAY, 3));
    // This week: 3 touches with pipeline people + 1 session; last week: 1 touch; the week before: nothing.
    expect(h).toEqual([
      { start: addDays(week.start, -14), done: 0 },
      { start: addDays(week.start, -7), done: 1 },
      { start: week.start, done: 4 },
    ]);
  });

  it("a touch in another Space doesn't count towards a goal", async () => {
    await as((tx) => saveMembership(tx, user.id, people.kwame, { spaceId: dating }, TODAY));
    await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: people.kwame, spaceId: dating, occurredOn: TODAY, type: "call" }));
    const g = (await as((tx) => getGoal(tx, goalId, TODAY, TZ)))!;
    expect(g.progress.touches).toBe(3);
  });

  it("custom stages can't strand people, and neither can the Space's", async () => {
    const custom = [
      { label: "Shortlist" },
      { label: "Pitched" },
      { key: "won", label: "Won", closed: true },
    ];
    const r = await as((tx) => updateGoal(tx, goalId, { ...base, text: "Raise a pre-seed round", spaceId: work, stages: custom }));
    expect(r).toMatchObject({ ok: false, field: "stages", message: expect.stringContaining('1 person is at "Identified"') });

    const g = (await as((tx) => getGoal(tx, goalId, TODAY, TZ)))!;
    const kwame = g.pipeline.find((p) => p.name === "Kwame Mensah")!;
    await as((tx) => moveStage(tx, kwame.linkId, "won"));
    const ok = await as((tx) => updateGoal(tx, goalId, { ...base, text: "Raise a pre-seed round", spaceId: work, stages: custom }));
    expect(ok.ok).toBe(true);
    const after = (await as((tx) => getGoal(tx, goalId, TODAY, TZ)))!;
    expect(after.customStages).toBe(true);
    expect(after.stages.map((s) => s.key)).toEqual(["shortlist", "pitched", "won"]);

    // Goals with their own stages don't block edits to the Space's stages.
    const space = (await as((tx) => listSpaces(tx))).find((s) => s.id === work)!;
    const edit = await as((tx) =>
      updateSpace(tx, work, { name: space.name, cadenceDays: 30, researchMode: "full", stages: space.defaults.stages.filter((s) => s.key !== "won").map((s) => ({ ...s, closed: Boolean(s.closed) })) }),
    );
    expect(edit.ok).toBe(true);
  });

  it("can't move to another Space while people are on it", async () => {
    expect(await as((tx) => updateGoal(tx, goalId, { ...base, text: "Raise a pre-seed round", spaceId: dating, stages: null }))).toMatchObject({ ok: false, field: "spaceId" });
  });

  it("removing someone can be undone; options exclude goals they're already on", async () => {
    const g = (await as((tx) => getGoal(tx, goalId, TODAY, TZ)))!;
    const ada = g.pipeline.find((p) => p.name === "Adaeze Okafor")!;
    expect((await as((tx) => goalOptionsForPerson(tx, people.adaeze))).map((o) => o.id)).not.toContain(goalId);
    const removed = (await as((tx) => unlinkPerson(tx, ada.linkId)))!;
    expect((await as((tx) => goalOptionsForPerson(tx, people.adaeze))).map((o) => o.id)).toContain(goalId);
    await as((tx) => restoreLink(tx, user.id, removed));
    expect((await as((tx) => getGoal(tx, goalId, TODAY, TZ)))!.pipeline.find((p) => p.name === "Adaeze Okafor")?.stage).toBe("won");
  });

  it("paused, archived and deleted goals", async () => {
    await as((tx) => setGoalState(tx, goalId, { active: false }));
    expect((await as((tx) => goalOptionsForPerson(tx, people.tunde))).map((o) => o.id)).not.toContain(goalId);
    await as((tx) => setGoalState(tx, goalId, { archived: true }));
    expect((await as((tx) => listGoals(tx, { spaceId: work, today: TODAY, tz: TZ }))).map((x) => x.id)).not.toContain(goalId);
    expect((await as((tx) => listGoals(tx, { spaceId: work, today: TODAY, tz: TZ, archived: true }))).map((x) => x.id)).toContain(goalId);
    await as((tx) => deleteGoal(tx, goalId));
    const [{ n }] = await sql`select count(*)::int as n from goal_links where goal_id = ${goalId}`;
    expect(n).toBe(0);
    const [room] = await sql`select goal_id from events where title = 'Founders Breakfast' and user_id = ${user.id}`;
    expect(room.goal_id).toBeNull();
  });

  it("other users can't see or link to someone else's goal", async () => {
    const r = await as((tx) => createGoal(tx, user.id, { ...base, text: "Win three clients", spaceId: work, type: "clients" }));
    if (!r.ok) throw new Error(r.message);
    const other = await createUser(sql, "Goals Stranger");
    expect(await db.withUser(other.id, (tx) => getGoal(tx, r.data.id, TODAY, TZ))).toBeNull();
    expect(await db.withUser(other.id, (tx) => linkPeople(tx, other.id, r.data.id, [people.tunde]))).toMatchObject({ ok: false });
  });
});
