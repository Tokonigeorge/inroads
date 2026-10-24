import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/domain/dates";
import type { Tx } from "@/server/db/with-user";
import { saveRoomDebrief } from "@/server/repos/debrief";
import { createGoal, linkPeople, moveStage } from "@/server/repos/goals";
import { createPerson, logTouch } from "@/server/repos/people";
import { roomImpact, roomImpactCounts } from "@/server/repos/room-impact";
import { createRoom } from "@/server/repos/rooms";
import { listSpaces } from "@/server/repos/spaces";
import { connect, createUser } from "./helpers";

const TZ = "Africa/Lagos";
const TODAY = todayIn(TZ);
const MET_ON = addDays(TODAY, -20);
const { sql, db } = connect();
let user: { id: string };
let work: string;
let room: string;
const ada = randomUUID();
const kwame = randomUUID();
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

beforeAll(async () => {
  user = await createUser(sql, "Room Measurer");
  work = (await as((tx) => listSpaces(tx))).find((s) => s.kind === "work")!.id;
  for (const [id, name] of [[ada, "Ada Obi"], [kwame, "Kwame Mensah"]]) {
    await as((tx) => createPerson(tx, user.id, { id, identity: { name }, membership: { spaceId: work } }, MET_ON));
  }
  const r = await as((tx) => createRoom(tx, user.id, { title: "Founders Breakfast", spaceId: work, kind: "meetup", startsOn: MET_ON, tz: TZ, freq: "none" }));
  if (!r.ok) throw new Error(r.message);
  room = r.data.id;
  const g = await as((tx) => createGoal(tx, user.id, { text: "Raise a pre-seed round", spaceId: work, type: "capital", priority: 1, weeklyTarget: 2, stages: null }));
  if (!g.ok) throw new Error(g.message);
  await as((tx) => linkPeople(tx, user.id, g.data.id, [kwame]));
});

describe("room impact", () => {
  it("is empty until you record who you met", async () => {
    expect(await as((tx) => roomImpact(tx, room, TODAY))).toMatchObject({ met: 0, people: [] });
  });

  it("counts people met there, touches since, and goal moves after you met", async () => {
    await as((tx) => saveRoomDebrief(tx, user.id, { eventId: room, occurrenceOn: MET_ON, followUpInDays: 0, met: [{ personId: ada }, { personId: kwame }] }, TODAY));
    await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: ada, spaceId: work, occurredOn: addDays(TODAY, -3), type: "coffee" }));
    const [link] = await sql`select id from goal_links where person_id = ${kwame}`;
    await as((tx) => moveStage(tx, link.id, "met"));

    const r = await as((tx) => roomImpact(tx, room, TODAY));
    expect(r).toMatchObject({ met: 2, keptInTouch: 1, inTouchNow: 1, movedForward: 1, won: 0 });
    expect(r.people.map((p) => [p.name, p.touchesSince, p.forward])).toEqual([
      ["Kwame Mensah", 0, 1],
      ["Ada Obi", 1, 0],
    ]);
    expect(Object.fromEntries(await as((tx) => roomImpactCounts(tx, [room], TODAY)))).toEqual({ [room]: { met: 2, inTouchNow: 1 } });
  });
});
