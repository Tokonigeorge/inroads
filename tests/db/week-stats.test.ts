import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/domain/dates";
import { weekOf } from "@/domain/goal-progress";
import type { Tx } from "@/server/db/with-user";
import { addPromise, createPerson, logTouch, setPromiseDone } from "@/server/repos/people";
import { listSpaces } from "@/server/repos/spaces";
import { weekStats } from "@/server/repos/week-stats";
import { connect, createUser } from "./helpers";

const { sql, db } = connect();
const TZ = "Africa/Lagos";
const TODAY = todayIn(TZ);
const WEEK = weekOf(TODAY);
let user: { id: string };
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

describe("weekStats", () => {
  beforeAll(async () => {
    user = await createUser(sql, "Week Owner");
    const spaces = await as((tx) => listSpaces(tx));
    const work = spaces.find((s) => s.kind === "work")!.id;
    const personal = spaces.find((s) => s.kind === "personal")!.id;
    const mk = async (name: string, spaceId: string) => {
      const id = randomUUID();
      const r = await as((tx) => createPerson(tx, user.id, { id, identity: { name }, membership: { spaceId } }, TODAY));
      if (!r.ok) throw new Error(r.message);
      return id;
    };
    const tunde = await mk("Tunde Bakare", work);
    const kemi = await mk("Kemi Bello", personal);
    const old = await mk("Dayo Adeleke", work);
    // Tunde twice this week (counts once), Kemi in another Space, Dayo only last week.
    for (const [personId, spaceId, on] of [[tunde, work, TODAY], [tunde, work, WEEK.start], [kemi, personal, TODAY], [old, work, addDays(WEEK.start, -1)]] as const) {
      await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId, spaceId, occurredOn: on, type: "call" }));
    }
    const p = (personId: string, owner: "me" | "them") => {
      const id = randomUUID();
      return as((tx) => addPromise(tx, user.id, { id, personId, spaceId: work, text: "Send the deck", owner })).then(() => id);
    };
    const kept = await p(tunde, "me");
    await as((tx) => setPromiseDone(tx, kept, true));
    await p(tunde, "me");
    await p(old, "me");
    await p(tunde, "them"); // theirs: not counted
  });

  it("counts people in touch this week once each, promises kept this week, and promises still owed", async () => {
    expect(await as((tx) => weekStats(tx, { start: WEEK.start, today: TODAY, tz: TZ }))).toEqual({ talkedTo: 2, promisesKept: 1, promisesOpen: 2 });
  });
});
