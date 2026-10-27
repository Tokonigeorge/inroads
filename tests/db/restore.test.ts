import { strToU8 } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildExport } from "@/server/account/export";
import { readBackup, restoreBackup, RestoreError } from "@/server/account/restore";
import { loadExampleData } from "@/server/seed/example";
import { connect, createUser } from "./helpers";

const { sql, db } = connect();
afterAll(() => sql.end());

let ada: { id: string; email: string };
let cleo: { id: string; email: string };
let backup: Uint8Array;

beforeAll(async () => {
  ada = await createUser(sql, "Ada Backup");
  cleo = await createUser(sql, "Cleo Fresh");
  await db.withUser(ada.id, (tx) => loadExampleData(tx, ada.id, "2026-10-23"));
  backup = (await db.withUser(ada.id, (tx) => buildExport(tx))).bytes;
});

const count = async (table: string, userId: string) => (await sql.unsafe(`select count(*)::int as n from ${table} where user_id = $1`, [userId]))[0].n as number;

describe("restore from backup", () => {
  it("brings a backup into another account, with new ids, and never twice", async () => {
    const r = await db.withUser(cleo.id, (tx) => restoreBackup(tx, cleo.id, readBackup(backup)));
    expect(r.people).toBe(await count("people", ada.id));
    expect(r.events).toBe(await count("events", ada.id));
    expect(r.touches).toBeGreaterThan(0);
    expect(await count("people", cleo.id)).toBe(r.people);
    expect(await count("interactions", cleo.id)).toBe(r.touches);
    // Every restored person sits in one of Cleo's own Spaces; nothing points at Ada's rows.
    const [{ n: foreign }] = await sql`select count(*)::int as n from person_spaces ps join spaces s on s.id = ps.space_id where ps.user_id = ${cleo.id} and s.user_id <> ${cleo.id}`;
    expect(foreign).toBe(0);
    const [{ n: shared }] = await sql`select count(*)::int as n from people a join people c on c.id = a.id where a.user_id = ${ada.id} and c.user_id = ${cleo.id}`;
    expect(shared).toBe(0);
  });

  it("restoring your own backup adds nothing you already have", async () => {
    const before = await count("people", ada.id);
    const r = await db.withUser(ada.id, (tx) => restoreBackup(tx, ada.id, readBackup(backup)));
    expect(r).toMatchObject({ people: 0, events: 0, touches: 0, promises: 0, goals: 0 });
    expect(await count("people", ada.id)).toBe(before);
  });

  it("reads the prototype's backup file", async () => {
    const dee = await createUser(sql, "Dee Prototype");
    const file = {
      app: "inroads",
      version: 1,
      profile: { name: "", headline: "Founder, Lagos fintech", goals: [{ id: "g1", text: "Raise a pre-seed round", type: "capital", priority: "high", weeklyTarget: 4, active: true }] },
      contacts: [
        {
          id: "c1",
          name: "Adaeze Okafor",
          email: "adaeze@kestrel.example",
          company: "Kestrel Ventures",
          whereMet: "Founders Breakfast",
          interests: ["Climate tech"],
          starred: true,
          goalIds: ["g1"],
          interactions: [{ id: "i1", date: "2026-09-01", type: "coffee", summary: "Coffee in Ikoyi" }],
          commitments: [{ id: "p1", text: "Send monthly update", owner: "me", due: "2026-11-01", done: false }],
        },
      ],
      events: [{ id: "e1", title: "Founders Breakfast", date: "2026-11-03", time: "08:00", kind: "meetup", recur: "monthly", contactIds: ["c1"] }],
    };
    const r = await db.withUser(dee.id, (tx) => restoreBackup(tx, dee.id, readBackup(strToU8(JSON.stringify(file)))));
    expect(r).toMatchObject({ people: 1, events: 1, touches: 1, promises: 1, goals: 1 });
    const [p] = await sql`select p.name, ps.starred, ps.where_met from people p join person_spaces ps on ps.person_id = p.id where p.user_id = ${dee.id}`;
    expect(p).toMatchObject({ name: "Adaeze Okafor", starred: true, where_met: "Founders Breakfast" });
    const [e] = await sql`select rrule, start_time from events where user_id = ${dee.id}`;
    expect(e).toMatchObject({ rrule: "FREQ=MONTHLY", start_time: "08:00:00" });
    expect(await count("goal_links", dee.id)).toBe(1);
    expect(await count("event_people", dee.id)).toBe(1);
    const [profile] = await sql`select headline from profiles where user_id = ${dee.id}`;
    expect(profile.headline).toBe("Founder, Lagos fintech");
  });

  it("turns away files that aren't backups", () => {
    expect(() => readBackup(strToU8("not json"))).toThrow(RestoreError);
    return expect(db.withUser(cleo.id, (tx) => restoreBackup(tx, cleo.id, { hello: "world" }))).rejects.toThrow("isn't an Inroads backup");
  });
});
