import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { peopleSorts, type PeopleQuery } from "@/contracts/people";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import {
  addPromise,
  createPerson,
  deletePerson,
  getPerson,
  listPeople,
  logTouch,
  removeFromSpace,
  restorePerson,
  saveCircle,
  saveMembership,
  setPersonArchived,
  setPromiseDone,
} from "@/server/repos/people";
import { listSpaces } from "@/server/repos/spaces";
import { connect, createUser } from "./helpers";

const { sql, db } = connect();
const TODAY = "2026-10-24";
let user: { id: string };
let work: string;
let personal: string;
afterAll(() => sql.end());

const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);
const names = (r: { items: { name: string }[] }) => r.items.map((i) => i.name);

async function add(name: string, extra: Partial<{ emails: string[]; phones: string[]; company: string; whereMet: string; starred: boolean; tags: string[]; space: string; cadence: number | "never" | null }> = {}) {
  const id = randomUUID();
  const r = await as((tx) =>
    createPerson(
      tx,
      user.id,
      {
        id,
        identity: { name, emails: extra.emails ?? [], phones: extra.phones ?? [], company: extra.company },
        membership: { spaceId: extra.space ?? work, whereMet: extra.whereMet, starred: extra.starred, tags: extra.tags, cadenceDays: extra.cadence ?? null },
      },
      TODAY,
    ),
  );
  if (!r.ok) throw new Error(r.message);
  return id;
}

beforeAll(async () => {
  user = await createUser(sql, "People Owner");
  const spaces = await as((tx) => listSpaces(tx));
  work = spaces.find((s) => s.kind === "work")!.id;
  personal = spaces.find((s) => s.kind === "personal")!.id;
});

describe("creating people", () => {
  it("normalises emails and phones, and is safe to replay", async () => {
    const id = randomUUID();
    const input = {
      id,
      identity: { name: "Ada Okafor", emails: ["ADA@Kestrel.example", "ada@kestrel.example"], phones: ["0803 123 4567"], company: "  Kestrel " },
      membership: { spaceId: work, whereMet: "Founders Breakfast", interests: "Running, climate", tags: "Investor, Lagos Fintech" },
    };
    expect(await as((tx) => createPerson(tx, user.id, input, TODAY))).toEqual({ ok: true, data: { id, created: true } });
    expect(await as((tx) => createPerson(tx, user.id, input, TODAY))).toEqual({ ok: true, data: { id, created: false } });
    const detail = (await as((tx) => getPerson(tx, id)))!;
    expect(detail.person).toMatchObject({ emails: ["ada@kestrel.example"], phones: ["+2348031234567"], company: "Kestrel" });
    expect(detail.memberships[0]).toMatchObject({ interests: ["Running", "climate"], tags: ["investor", "lagos-fintech"], cadenceAnchorOn: TODAY });
  });

  it("explains bad contact details instead of saving them", async () => {
    const r = await as((tx) => createPerson(tx, user.id, { id: randomUUID(), identity: { name: "X", phones: ["12"] }, membership: { spaceId: work } }, TODAY));
    expect(r).toMatchObject({ ok: false, field: "phones" });
    const r2 = await as((tx) => createPerson(tx, user.id, { id: randomUUID(), identity: { name: "" }, membership: { spaceId: work } }, TODAY));
    expect(r2).toMatchObject({ ok: false, message: "Add a name." });
  });
});

describe("the people list", () => {
  let ids: Record<string, string>;
  beforeAll(async () => {
    await sql`delete from people where user_id = ${user.id}`;
    ids = {
      tunde: await add("Tunde Bakare", { company: "Meridian Telecoms", emails: ["tunde@meridian.example"], whereMet: "Client dinner", tags: ["client"] }),
      zainab: await add("Zainab Bello", { phones: ["0803 999 0000"], starred: true, cadence: 14 }),
      kemi: await add("Kemi Adebayo", { company: "Paystack" }),
      seun: await add("Seun Bello", { space: personal, whereMet: "Church" }),
    };
    await as((tx) => saveMembership(tx, user.id, ids.kemi, { spaceId: personal, notes: "Old classmate", cadenceDays: 7 }, TODAY));
    await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: ids.tunde, spaceId: work, occurredOn: "2026-10-20", type: "call" }));
    await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: ids.zainab, spaceId: work, occurredOn: "2026-09-01", type: "coffee" }));
  });

  const list = (q: PeopleQuery) => as((tx) => listPeople(tx, q, TODAY));

  it("lists everyone across Spaces, or one Space", async () => {
    expect(names(await list({}))).toEqual(["Kemi Adebayo", "Seun Bello", "Tunde Bakare", "Zainab Bello"]);
    expect(names(await list({ spaceId: personal }))).toEqual(["Kemi Adebayo", "Seun Bello"]);
    const kemi = (await list({})).items.find((p) => p.name === "Kemi Adebayo")!;
    expect(kemi.spaces.map((x) => x.name)).toEqual(["Work", "Personal"]);
    expect(kemi.cadenceDays).toBe(7); // shortest across Spaces
  });

  it("searches names, companies, emails, phone digits, where you met and notes", async () => {
    expect(names(await list({ q: "bello" }))).toEqual(["Seun Bello", "Zainab Bello"]);
    expect(names(await list({ q: "meridian" }))).toEqual(["Tunde Bakare"]);
    expect(names(await list({ q: "tunde@" }))).toEqual(["Tunde Bakare"]);
    expect(names(await list({ q: "0803 999" }))).toEqual([]); // local format isn't stored…
    expect(names(await list({ q: "803999" }))).toEqual(["Zainab Bello"]); // …but the digits match
    expect(names(await list({ q: "church" }))).toEqual(["Seun Bello"]);
    expect(names(await list({ q: "classmate", spaceId: work }))).toEqual([]);
    expect(names(await list({ q: "100%_" }))).toEqual([]);
  });

  it("filters", async () => {
    expect(names(await list({ filter: "starred" }))).toEqual(["Zainab Bello"]);
    expect(names(await list({ filter: "untouched" }))).toEqual(["Kemi Adebayo", "Seun Bello"]);
    // Zainab: every 14 days, last touched 1 Sep. Kemi: weekly in Personal, added today → not yet due.
    expect(names(await list({ filter: "due" }))).toEqual(["Zainab Bello"]);
    expect(names(await list({ filter: "context" }))).toEqual(["Kemi Adebayo", "Zainab Bello"]);
    expect(names(await list({ tag: "client" }))).toEqual(["Tunde Bakare"]);
  });

  it("uses circles for reminders when the person has no setting of their own", async () => {
    await as((tx) => saveCircle(tx, user.id, { spaceId: work, name: "Clients", defaultCadenceDays: 3 }));
    const [circle] = await sql`select id from circles where user_id = ${user.id} and name = 'Clients'`;
    await as((tx) => saveMembership(tx, user.id, ids.tunde, { spaceId: work, circleId: circle.id, tags: ["client"] }, TODAY));
    const tunde = (await list({ q: "tunde" })).items[0];
    expect(tunde.cadenceDays).toBe(3);
    expect(tunde.dueOn).toBe("2026-10-23");
    expect(names(await list({ circleId: circle.id }))).toEqual(["Tunde Bakare"]);
    expect(names(await list({ filter: "due" }))).toEqual(["Tunde Bakare", "Zainab Bello"]);
  });

  it("archives and restores", async () => {
    await as((tx) => setPersonArchived(tx, ids.seun, true));
    expect(names(await list({}))).not.toContain("Seun Bello");
    expect(names(await list({ filter: "archived" }))).toEqual(["Seun Bello"]);
    await as((tx) => setPersonArchived(tx, ids.seun, false));
    expect(names(await list({}))).toContain("Seun Bello");
  });

  it("deletes with undo", async () => {
    await as((tx) => deletePerson(tx, ids.seun));
    expect(names(await list({}))).not.toContain("Seun Bello");
    expect(await as((tx) => getPerson(tx, ids.seun))).toBeNull();
    await as((tx) => restorePerson(tx, ids.seun));
    expect(names(await list({}))).toContain("Seun Bello");
  });

  it("removes someone from one Space and what was recorded there, keeping the rest", async () => {
    await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: ids.kemi, spaceId: personal, occurredOn: "2026-10-22", type: "call" }));
    expect((await as((tx) => getPerson(tx, ids.kemi)))!.person.lastTouchedOn).toBe("2026-10-22");
    expect(await as((tx) => removeFromSpace(tx, ids.kemi, personal))).toEqual({ ok: true, data: null });
    const kemi = (await as((tx) => getPerson(tx, ids.kemi)))!;
    expect(kemi.memberships.map((m) => m.space.name)).toEqual(["Work"]);
    expect(kemi.touches).toHaveLength(0);
    expect(kemi.person.lastTouchedOn).toBeNull();
    expect(await as((tx) => removeFromSpace(tx, ids.kemi, work))).toMatchObject({ ok: false });
  });
});

describe("touches and promises", () => {
  it("logs a touch with a promise, idempotently, and marks the person as sorted", async () => {
    const pid = await add("Ifeoma Nwosu");
    await sql`update person_spaces set triage_state = 'pending' where person_id = ${pid}`;
    const touch = {
      id: randomUUID(),
      personId: pid,
      spaceId: work,
      occurredOn: "2026-10-23",
      type: "coffee" as const,
      summary: "Talked about hiring",
      promise: { id: randomUUID(), text: "Send two engineer CVs", owner: "me" as const, dueOn: "2026-10-30" },
    };
    expect((await as((tx) => logTouch(tx, user.id, touch))).ok).toBe(true);
    expect((await as((tx) => logTouch(tx, user.id, touch))).ok).toBe(true);
    const d = (await as((tx) => getPerson(tx, pid)))!;
    expect(d.touches).toHaveLength(1);
    expect(d.promises).toHaveLength(1);
    expect(d.promises[0]).toMatchObject({ text: "Send two engineer CVs", owner: "me", dueOn: "2026-10-30", interactionId: touch.id });
    expect(d.memberships[0].triageState).toBe("done");

    await as((tx) => addPromise(tx, user.id, { id: randomUUID(), personId: pid, spaceId: work, text: "Intro to two angels", owner: "them" }));
    await as((tx) => setPromiseDone(tx, d.promises[0].id, true));
    const after = (await as((tx) => getPerson(tx, pid)))!;
    expect(after.promises.map((p) => [p.text, Boolean(p.doneAt)])).toEqual([
      ["Intro to two angels", false],
      ["Send two engineer CVs", true],
    ]);
  });

  it("refuses touches in a Space the person isn't in", async () => {
    const pid = await add("Only Work");
    const r = await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: pid, spaceId: personal, occurredOn: TODAY, type: "call" }));
    expect(r).toMatchObject({ ok: false, field: "spaceId" });
  });
});

describe("at scale", () => {
  it("pages through every person exactly once in every sort, and stays fast at 10,000 people", async () => {
    const big = await createUser(sql, "Big Network");
    const [space] = await sql`select id from spaces where user_id = ${big.id} and kind = 'work'`;
    await sql`
      with p as (
        insert into people (user_id, name, company, last_touched_on, created_at)
        select ${big.id}, 'Person ' || lpad(g::text, 5, '0'), case when g % 3 = 0 then 'Paystack' end,
               case when g % 4 = 0 then null else date '2026-10-24' - (g % 200) end,
               now() - (g || ' minutes')::interval
          from generate_series(1, 10000) g
        returning id, name
      )
      insert into person_spaces (user_id, person_id, space_id, starred, cadence_days)
      select ${big.id}, p.id, ${space.id}, right(p.name, 1) = '7', case when right(p.name, 1) in ('1', '2') then 30 end from p`;
    // Bulk loads must refresh planner statistics (the import job does the same).
    await sql`analyze people`;
    await sql`analyze person_spaces`;

    const run = (q: PeopleQuery) => db.withUser(big.id, (tx) => listPeople(tx, q, TODAY));
    const started = performance.now();
    const first = await run({ sort: "due", limit: 60 });
    const searched = await run({ q: "paystack", filter: "starred", sort: "recent" });
    const elapsed = performance.now() - started;
    expect(first.items).toHaveLength(60);
    expect(searched.items.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500); // two queries over 10k rows; ~40 ms locally

    for (const sort of peopleSorts) {
      const seen = new Set<string>();
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await run({ sort, limit: 200, cursor, q: "person 01" }); // Person 01000–01999
        for (const p of page.items) {
          expect(seen.has(p.id), `${sort} repeated ${p.name}`).toBe(false);
          seen.add(p.id);
        }
        cursor = page.nextCursor ?? undefined;
        pages++;
      } while (cursor && pages < 20);
      expect(seen.size, sort).toBe(1000);
    }

    const [{ n }] = await sql`select count(*)::int as n from people where user_id = ${big.id}`;
    expect(n).toBe(10_000);
    await sql`delete from people where user_id = ${big.id}`;
    await sql`delete from auth.users where id = ${big.id}`;
  }, 60_000);
});

describe("isolation", () => {
  it("another account can't read, touch or edit these people", async () => {
    const other = await createUser(sql, "Someone Else");
    const [victim] = await sql`select id from people where user_id = ${user.id} limit 1`;
    const otherWork = (await db.withUser(other.id, (tx) => listSpaces(tx))).find((s) => s.kind === "work")!.id;
    expect(await db.withUser(other.id, (tx) => getPerson(tx, victim.id))).toBeNull();
    const r = await db.withUser(other.id, (tx) => logTouch(tx, other.id, { id: randomUUID(), personId: victim.id, spaceId: otherWork, occurredOn: TODAY, type: "call" }));
    expect(r.ok).toBe(false);
    await db.withUser(other.id, (tx) => setPersonArchived(tx, victim.id, true));
    const [still] = await sql`select archived_at from person_spaces where person_id = ${victim.id}`;
    expect(still.archived_at).toBeNull();
    const ok = await db.withUser(other.id, (tx) => deletePerson(tx, victim.id));
    expect(ok).toBe(false);
    void eq;
    void t;
  });
});
