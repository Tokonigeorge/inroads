import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@/domain/dates";
import type { Tx } from "@/server/db/with-user";
import { createGoal, linkPeople } from "@/server/repos/goals";
import { loadNetworkMap } from "@/server/repos/network-map";
import { createPerson, logTouch } from "@/server/repos/people";
import { listSpaces } from "@/server/repos/spaces";
import { connect, createUser } from "./helpers";

const TODAY = "2026-10-29";
const { sql, db } = connect();
let user: { id: string };
let work: string;
let personal: string;
let raise: string;
let hire: string;
const ada = randomUUID();
const bola = randomUUID();
const chidi = randomUUID();
const dayo = randomUUID();
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

beforeAll(async () => {
  user = await createUser(sql, "Map Maker");
  const spaces = await as((tx) => listSpaces(tx));
  work = spaces.find((s) => s.kind === "work")!.id;
  personal = spaces.find((s) => s.kind === "personal")!.id;
  const person = (id: string, name: string, spaceId = work) => as((tx) => createPerson(tx, user.id, { id, identity: { name }, membership: { spaceId } }, TODAY));
  await person(ada, "Ada Eze");
  await person(bola, "Bola Ade");
  await person(chidi, "Chidi Obi");
  await person(dayo, "Dayo Lawal", personal);
  for (const [i, d] of [0, 3, 10, 20, 40].entries()) {
    const r = await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: ada, spaceId: work, occurredOn: addDays(TODAY, -d), type: "call", summary: `Call ${i}` }));
    if (!r.ok) throw new Error(r.message);
  }
  await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: bola, spaceId: work, occurredOn: addDays(TODAY, -120), type: "message", summary: null }));
  await sql`update person_spaces set starred = true where person_id = ${chidi}`;
  const g1 = await as((tx) => createGoal(tx, user.id, { text: "Raise a pre-seed round", spaceId: work, type: "capital", priority: 1, weeklyTarget: 2, stages: null }));
  const g2 = await as((tx) => createGoal(tx, user.id, { text: "Hire a designer", spaceId: work, type: "hiring", priority: 2, weeklyTarget: 1, stages: null }));
  if (!g1.ok || !g2.ok) throw new Error("goal");
  raise = g1.data.id;
  hire = g2.data.id;
  await as((tx) => linkPeople(tx, user.id, hire, [ada, bola]));
  await as((tx) => linkPeople(tx, user.id, raise, [ada]));
});

describe("network map", () => {
  it("draws a Space's people: starred first, then strongest, with their top-priority goal", async () => {
    const map = await as((tx) => loadNetworkMap(tx, work, TODAY));
    expect(map.total).toBe(3);
    expect(map.people.map((p) => p.name)).toEqual(["Chidi Obi", "Ada Eze", "Bola Ade"]);
    const byName = Object.fromEntries(map.people.map((p) => [p.name, p]));
    expect(byName["Chidi Obi"]).toMatchObject({ starred: true, strength: null, goalId: null });
    expect(byName["Ada Eze"].strength).toBeGreaterThan(70);
    expect(byName["Bola Ade"].strength).toBeLessThan(20);
    // On both goals: the higher-priority one wins.
    expect(byName["Ada Eze"].goalId).toBe(raise);
    expect(byName["Bola Ade"].goalId).toBe(hire);
    expect(map.goals.map((g) => g.text)).toEqual(["Raise a pre-seed round", "Hire a designer"]);
  });

  it("keeps Spaces apart, and All spaces shows everyone", async () => {
    const mine = await as((tx) => loadNetworkMap(tx, personal, TODAY));
    expect(mine.people.map((p) => p.name)).toEqual(["Dayo Lawal"]);
    expect(mine.goals).toEqual([]);
    expect((await as((tx) => loadNetworkMap(tx, null, TODAY))).total).toBe(4);
  });

  it("stops at the limit but still counts everyone", async () => {
    const map = await as((tx) => loadNetworkMap(tx, work, TODAY, 2));
    expect(map.people).toHaveLength(2);
    expect(map.total).toBe(3);
  });
});
