import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/domain/dates";
import type { Tx } from "@/server/db/with-user";
import { createGoal, linkPeople } from "@/server/repos/goals";
import { introOutcomes, introsAbout, requestIntro, warmPaths } from "@/server/repos/intros";
import { createPerson, logTouch, setPromiseDone } from "@/server/repos/people";
import { createRoom, linkPerson } from "@/server/repos/rooms";
import { listSpaces } from "@/server/repos/spaces";
import { connect, createUser, errorCode } from "./helpers";

const TODAY = "2026-10-24";
const { sql, db } = connect();
let user: { id: string };
let work: string;
let personal: string;
let goal: string;
const tunde = randomUUID();
const kemi = randomUUID();
const ifeoma = randomUUID();
const chidi = randomUUID();
const sade = randomUUID();
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

beforeAll(async () => {
  user = await createUser(sql, "Intro Asker");
  const spaces = await as((tx) => listSpaces(tx));
  work = spaces.find((s) => s.kind === "work")!.id;
  personal = spaces.find((s) => s.kind === "personal")!.id;
  const person = (id: string, name: string, company: string | null, spaceId = work) =>
    as((tx) => createPerson(tx, user.id, { id, identity: { name, company }, membership: { spaceId } }, TODAY));
  await person(tunde, "Tunde Bakare", "Kestrel Ventures");
  await person(kemi, "Kemi Adebayo", null);
  await person(ifeoma, "Ifeoma Nwosu", "kestrel ventures");
  await person(chidi, "Chidi Okeke", null);
  await person(sade, "Sade Lawal", "Kestrel Ventures", personal);
  await sql`insert into person_links (user_id, from_person_id, to_person_id, kind, space_id, note) values (${user.id}, ${kemi}, ${tunde}, 'knows', ${work}, 'Old classmates')`;
  const room = await as((tx) => createRoom(tx, user.id, { title: "Founders Breakfast", spaceId: work, kind: "meetup", startsOn: TODAY, tz: "Africa/Lagos", freq: "none" }));
  if (!room.ok) throw new Error(room.message);
  await as((tx) => linkPerson(tx, user.id, room.data.id, tunde, "attendee"));
  await as((tx) => linkPerson(tx, user.id, room.data.id, chidi, "attendee"));
  const g = await as((tx) => createGoal(tx, user.id, { text: "Raise a pre-seed round", spaceId: work, type: "capital", priority: 1, weeklyTarget: 2, stages: null }));
  if (!g.ok) throw new Error(g.message);
  goal = g.data.id;
  await as((tx) => linkPeople(tx, user.id, goal, [tunde]));
});

describe("intro requests", () => {
  it("finds warm paths in the Space: links, same company, same rooms", async () => {
    const paths = await as((tx) => warmPaths(tx, tunde, work, TODAY));
    expect(paths.map((p) => [p.name, p.reasons])).toEqual([
      ["Chidi Okeke", ["Both linked to Founders Breakfast"]],
      ["Ifeoma Nwosu", ["Also at kestrel ventures"]],
      ["Kemi Adebayo", ["Knows them: Old classmates"]],
    ]);
    // Sade works there too, but she's in Personal: Spaces stay separate.
    expect(paths.map((p) => p.name)).not.toContain("Sade Lawal");
    expect(paths.every((p) => p.strength === null)).toBe(true);
  });

  it("puts the people you're closest to first", async () => {
    await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: ifeoma, spaceId: work, occurredOn: TODAY, type: "coffee" }));
    const paths = await as((tx) => warmPaths(tx, tunde, work, TODAY));
    expect(paths[0]).toMatchObject({ name: "Ifeoma Nwosu", strength: 63 });
    await sql`delete from interactions where person_id = ${ifeoma}`;
    await sql`update people set last_touched_on = null where id = ${ifeoma}`;
  });

  it("asking tracks a promise they owe, logs the ask and moves the person to Warm path found", async () => {
    const r = await as((tx) => requestIntro(tx, user.id, { targetId: tunde, connectorId: kemi, spaceId: work, goalId: goal, dueInDays: 5 }, TODAY));
    expect(r.ok).toBe(true);
    const [c] = await sql`select text, owner, kind, due_on::text as due, about_person_id from commitments where person_id = ${kemi}`;
    expect(c).toEqual({ text: "Introduce you to Tunde Bakare", owner: "them", kind: "intro", due: addDays(TODAY, 5), about_person_id: tunde });
    expect(await sql`select summary from interactions where person_id = ${kemi}`).toEqual([{ summary: "Asked for an intro to Tunde Bakare" }]);
    expect(await sql`select stage from goal_links where person_id = ${tunde}`).toEqual([{ stage: "warm_path" }]);
    expect(await as((tx) => requestIntro(tx, user.id, { targetId: tunde, connectorId: kemi, spaceId: work }, TODAY))).toMatchObject({ ok: false, message: "You've already asked Kemi for this intro." });
    expect((await as((tx) => introsAbout(tx, tunde))).map((i) => i.connector)).toEqual(["Kemi Adebayo"]);
  });

  it("ticking it done records who introduced you and moves them to Introduced", async () => {
    const [c] = await sql`select id from commitments where person_id = ${kemi} and kind = 'intro'`;
    await as((tx) => setPromiseDone(tx, c.id, true));
    expect(await sql`select kind, to_person_id from person_links where from_person_id = ${tunde} and kind = 'introduced_by'`).toEqual([{ kind: "introduced_by", to_person_id: kemi }]);
    expect(await sql`select stage from goal_links where person_id = ${tunde}`).toEqual([{ stage: "introduced" }]);
    expect((await as((tx) => warmPaths(tx, tunde, work, TODAY))).find((p) => p.name === "Kemi Adebayo")?.reasons).toContain("Introduced you");
  });

  it("outcomes: asked, made, met, and who you're still waiting on", async () => {
    // Kemi's intro to Tunde is done (above). Ask Chidi for one to Ifeoma, due yesterday.
    await as((tx) => requestIntro(tx, user.id, { targetId: ifeoma, connectorId: chidi, spaceId: work, dueInDays: 1 }, TODAY));
    await sql`update commitments set due_on = ${addDays(TODAY, -1)} where person_id = ${chidi} and kind = 'intro'`;
    let o = await as((tx) => introOutcomes(tx, null));
    expect(o).toMatchObject({ asked: 2, made: 1, met: 0 });
    expect(o.waiting).toEqual([{ id: expect.any(String), connectorId: chidi, connector: "Chidi Okeke", targetId: ifeoma, target: "Ifeoma Nwosu", dueOn: addDays(TODAY, -1) }]);
    // Speaking to Tunde after the intro counts as met.
    await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: tunde, spaceId: work, occurredOn: todayIn("UTC"), type: "coffee" }));
    o = await as((tx) => introOutcomes(tx, work));
    expect(o).toMatchObject({ asked: 2, made: 1, met: 1 });
    expect((await as((tx) => introOutcomes(tx, personal))).asked).toBe(0);
  });

  it("keeps Spaces separate and refuses nonsense", async () => {
    expect(await as((tx) => requestIntro(tx, user.id, { targetId: tunde, connectorId: sade, spaceId: work }, TODAY))).toMatchObject({ ok: false });
    expect(await as((tx) => requestIntro(tx, user.id, { targetId: tunde, connectorId: tunde, spaceId: work }, TODAY))).toMatchObject({ ok: false });
    // The database refuses an intro about someone outside the Space, whatever the app does.
    expect(
      await errorCode(as((tx) => tx.execute(sql`insert into commitments (user_id, person_id, space_id, text, owner, kind, about_person_id) values (${user.id}, ${kemi}, ${work}, 'x', 'them', 'intro', ${sade})` as never))),
    ).not.toBe("no error");
  });
});
