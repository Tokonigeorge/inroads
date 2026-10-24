import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayIn } from "@/domain/dates";
import type { Tx } from "@/server/db/with-user";
import { createGoal, linkPeople } from "@/server/repos/goals";
import { dismissDuplicate, listDuplicates, mergePeople, recentMerges, undoMerge } from "@/server/repos/merge";
import { addPromise, createPerson, logTouch, saveMembership } from "@/server/repos/people";
import { createRoom, linkPerson } from "@/server/repos/rooms";
import { listSpaces } from "@/server/repos/spaces";
import { connect, createUser } from "./helpers";

const { sql, db } = connect();
const TODAY = todayIn("Africa/Lagos");
let user: { id: string };
let work: string;
let personal: string;
const a = randomUUID();
const b = randomUUID();
let suggestionId: string;
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

async function snapshot() {
  const [people, ms, touches, promises, goals, rooms] = await Promise.all([
    sql`select id, name, emails, phones, company, position, deleted_at, merged_into_id from people where id in (${a}, ${b}) order by name, id`,
    sql`select person_id, space_id, where_met, notes, tags, starred from person_spaces where person_id in (${a}, ${b}) order by person_id, space_id`,
    sql`select person_id, count(*)::int as n from interactions where person_id in (${a}, ${b}) group by person_id order by person_id`,
    sql`select person_id, count(*)::int as n from commitments where person_id in (${a}, ${b}) group by person_id order by person_id`,
    sql`select person_id, stage from goal_links where person_id in (${a}, ${b}) order by person_id`,
    sql`select person_id, role from event_people where person_id in (${a}, ${b}) order by person_id, role`,
  ]);
  return JSON.parse(JSON.stringify({ people, ms, touches, promises, goals, rooms }));
}

beforeAll(async () => {
  user = await createUser(sql, "Merge Owner");
  const spaces = await as((tx) => listSpaces(tx));
  work = spaces.find((s) => s.kind === "work")!.id;
  personal = spaces.find((s) => s.kind === "personal")!.id;
  await as((tx) => createPerson(tx, user.id, { id: a, identity: { name: "David Okafor", emails: ["david@kestrel.example"] }, membership: { spaceId: work, whereMet: "Founders Breakfast", notes: "Invests in fintech" } }, TODAY));
  await as((tx) => createPerson(tx, user.id, { id: b, identity: { name: "David Okafor", phones: ["+2348031112222"], company: "Kestrel Ventures" }, membership: { spaceId: work, notes: "Has two kids", tags: "investor" } }, TODAY));
  await as((tx) => saveMembership(tx, user.id, b, { spaceId: personal, whereMet: "Church" }, TODAY));
  await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: b, spaceId: work, occurredOn: TODAY, type: "coffee" }));
  await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: b, spaceId: personal, occurredOn: TODAY, type: "call" }));
  await as((tx) => addPromise(tx, user.id, { id: randomUUID(), personId: b, spaceId: work, text: "Send deck", owner: "me", dueOn: null }));
  const goal = await as((tx) => createGoal(tx, user.id, { text: "Raise a pre-seed", spaceId: work, type: "capital", priority: 1, weeklyTarget: 3, stages: null }));
  if (!goal.ok) throw new Error(goal.message);
  await as((tx) => linkPeople(tx, user.id, goal.data.id, [a], "met"));
  await as((tx) => linkPeople(tx, user.id, goal.data.id, [b], "identified"));
  const room = await as((tx) => createRoom(tx, user.id, { title: "Breakfast", spaceId: work, startsOn: TODAY, tz: "Africa/Lagos", kind: "meetup", freq: "none" }));
  if (!room.ok) throw new Error(room.message);
  await as((tx) => linkPerson(tx, user.id, room.data.id, b, "attendee"));
  // What a name-only match from an import leaves behind.
  const [s] = await sql`insert into suggestions (user_id, space_id, kind, target_type, target_id, payload, why, origin)
    values (${user.id}, ${work}, 'merge', 'person', ${b}, ${JSON.stringify({ personIds: [a, b] })}::text::jsonb, 'Same name as David Okafor, no shared email or phone', 'import') returning id`;
  suggestionId = s.id;
});

describe("merging people", () => {
  let before: unknown;

  it("lists possible duplicates with both sides", async () => {
    const [d] = await as((tx) => listDuplicates(tx));
    expect(d).toMatchObject({ suggestionId, a: { id: a, spaces: ["Work"] }, b: { id: b, spaces: ["Work", "Personal"], touches: 2 } });
  });

  it("merges details and moves everything to the kept person", async () => {
    before = await snapshot();
    const r = await as((tx) => mergePeople(tx, user.id, { keepId: a, otherId: b, choices: { company: "other" }, suggestionId }));
    expect(r).toEqual({ ok: true, data: { suggestionId } });

    const [kept] = await sql`select emails, phones, company from people where id = ${a}`;
    expect(kept).toEqual({ emails: ["david@kestrel.example"], phones: ["+2348031112222"], company: "Kestrel Ventures" });
    const [gone] = await sql`select deleted_at, merged_into_id from people where id = ${b}`;
    expect(gone.deleted_at).not.toBeNull();
    expect(gone.merged_into_id).toBe(a);

    const ms = await sql`select space_id, where_met, notes, tags from person_spaces where person_id = ${a} order by space_id`;
    expect(ms).toHaveLength(2);
    const w = ms.find((m) => m.space_id === work)!;
    expect(w).toMatchObject({ where_met: "Founders Breakfast", notes: "Invests in fintech\n\nHas two kids", tags: ["investor"] });
    expect(ms.find((m) => m.space_id === personal)?.where_met).toBe("Church");

    const [{ n: touches }] = await sql`select count(*)::int as n from interactions where person_id = ${a}`;
    expect(touches).toBe(2);
    const [{ n: promises }] = await sql`select count(*)::int as n from commitments where person_id = ${a}`;
    expect(promises).toBe(1);
    // Both were on the goal: the kept person's stage stays.
    expect(await sql`select stage from goal_links where person_id in (${a}, ${b})`).toEqual([{ stage: "met" }]);
    expect(await sql`select person_id from event_people where person_id in (${a}, ${b})`).toEqual([{ person_id: a }]);
    const [p] = await sql`select last_touched_on::text from people where id = ${a}`;
    expect(p.last_touched_on).toBe(TODAY);

    expect(await as((tx) => listDuplicates(tx))).toEqual([]);
    expect((await as((tx) => recentMerges(tx))).map((m) => [m.keptName, m.otherName])).toEqual([["David Okafor", "David Okafor"]]);
  });

  it("undo puts both people back exactly as they were", async () => {
    expect(await as((tx) => undoMerge(tx, suggestionId))).toEqual({ ok: true, data: null });
    expect(await snapshot()).toEqual(before);
    expect((await as((tx) => listDuplicates(tx))).map((d) => d.suggestionId)).toEqual([suggestionId]);
    expect(await as((tx) => undoMerge(tx, suggestionId))).toMatchObject({ ok: false });
  });

  it("keep both dismisses the suggestion", async () => {
    await as((tx) => dismissDuplicate(tx, suggestionId));
    expect(await as((tx) => listDuplicates(tx))).toEqual([]);
  });

  it("refuses merging someone into themselves, or someone else's people", async () => {
    expect(await as((tx) => mergePeople(tx, user.id, { keepId: a, otherId: a, choices: {} }))).toMatchObject({ ok: false });
    const other = await createUser(sql, "Merge Stranger");
    expect(await db.withUser(other.id, (tx) => mergePeople(tx, other.id, { keepId: a, otherId: b, choices: {} }))).toMatchObject({ ok: false });
  });
});
