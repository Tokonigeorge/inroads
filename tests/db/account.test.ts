import { randomBytes } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteAccount } from "@/server/account/delete";
import { buildExport, latestExport, readExport, runExport } from "@/server/account/export";
import { loadExampleData } from "@/server/seed/example";
import { briefsDue } from "@/server/system/briefs";
import { connectionsStore } from "@/server/system/connections";
import { jobsStore } from "@/server/system/jobs";
import { connect, createUser } from "./helpers";

process.env.TOKEN_ENC_KEYS = JSON.stringify({ v1: randomBytes(32).toString("base64") });
process.env.TOKEN_ENC_CURRENT = "v1";

const { sql, db, sys } = connect();
afterAll(() => sql.end());

let ada: { id: string; email: string };
let bob: { id: string; email: string };
let work: string;

beforeAll(async () => {
  ada = await createUser(sql, "Ada Export");
  bob = await createUser(sql, "Bob Bystander");
  for (const u of [ada, bob]) await db.withUser(u.id, (tx) => loadExampleData(tx, u.id, "2026-10-23"));
  [{ id: work }] = await sql`select id from spaces where user_id = ${ada.id} and kind = 'work'`;
  await connectionsStore(sys).upsert({
    userId: ada.id,
    provider: "google",
    accountEmail: "ada@gmail.example",
    scopes: ["https://www.googleapis.com/auth/contacts.readonly", "https://www.googleapis.com/auth/calendar.events.readonly", "https://www.googleapis.com/auth/calendar.calendarlist.readonly"],
    spaceId: work,
    tokens: { access_token: "secret-access", refresh_token: "secret-refresh", expires_at: 0, scope: "" },
  });
  // A merged-away duplicate, so cascades have to cope with people pointing at people.
  const [keep] = await sql`select id from people where user_id = ${ada.id} limit 1`;
  await sql`insert into people (user_id, name, merged_into_id, deleted_at) values (${ada.id}, 'Old copy', ${keep.id}, now())`;
});

const unzip = (bytes: Uint8Array) => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));

describe("export", () => {
  it("has every table as JSON and spreadsheets, only your rows, and no secrets", async () => {
    const out = await db.withUser(ada.id, (tx) => buildExport(tx, new Date("2026-10-24T10:00:00Z")));
    expect(out.filename).toBe("inroads-export-2026-10-24.zip");
    const files = unzip(out.bytes);
    expect(Object.keys(files).sort()).toEqual(["inroads.json", "people.csv", "promises.csv", "rooms.csv", "touches.csv"]);
    const json = JSON.parse(files["inroads.json"]);
    expect(json).toMatchObject({ format: "inroads-export", version: 1, profile: { name: "Ada Export" } });
    expect(json.people.length).toBeGreaterThan(5);
    expect(json.people.every((p: { userId: string }) => p.userId === ada.id)).toBe(true);
    expect(json.people[0]).not.toHaveProperty("search");
    expect(json.connections).toEqual([expect.objectContaining({ provider: "google", accountEmail: "ada@gmail.example" })]);
    expect(files["inroads.json"]).not.toMatch(/secret-access|secret-refresh|tokensEnc|tokens_enc/);
    // Spreadsheets list live people only (not the merged copy).
    const peopleCsv = files["people.csv"].split("\r\n");
    expect(peopleCsv[0]).toMatch(/^Name,Space,Emails,Phones/);
    expect(files["people.csv"]).not.toContain("Old copy");
    expect(peopleCsv.length - 2).toBe(out.counts.people);
    expect(files["touches.csv"].split("\r\n")[0]).toBe("Date,Person,Space,Type,Summary");
  });

  it("runs as a job, keeps only the newest export, and only its owner can read it", async () => {
    const first = await runExport(ada.id, await jobsStore(sys).create(ada.id, "export"), { db, sys });
    const jobId = await jobsStore(sys).create(ada.id, "export");
    const second = await runExport(ada.id, jobId, { db, sys });
    expect(second).not.toBe(first);
    const [job] = await sql`select status, result_ref from jobs where id = ${jobId}`;
    expect(job.status).toBe("done");
    expect(job.result_ref.exportId).toBe(second);
    expect(await db.withUser(ada.id, (tx) => readExport(tx, first))).toBeNull();
    expect((await db.withUser(ada.id, latestExport))?.id).toBe(second);
    expect(await db.withUser(bob.id, (tx) => readExport(tx, second))).toBeNull();
    const row = await db.withUser(ada.id, (tx) => readExport(tx, second));
    expect(Object.keys(unzipSync(new Uint8Array(row!.data)))).toContain("people.csv");
  });
});

describe("briefs prepared at your brief time", () => {
  it("finds Spaces where you read briefs, once your brief time has passed, until today's is written", async () => {
    const u = await createUser(sql, "Brief Reader");
    const [s] = await sql`select id from spaces where user_id = ${u.id} and kind = 'work'`;
    await sql`update profiles set timezone = 'Africa/Lagos', brief_time = '07:30' where user_id = ${u.id}`;
    await sql`insert into briefs (user_id, space_id, kind, period_key, markdown, created_at) values (${u.id}, ${s.id}, 'daily', '2026-10-23', 'x', '2026-10-23T07:00:00Z')`;
    const mine = async (at: string) => (await briefsDue(sys, new Date(at))).filter((b) => b.userId === u.id);
    expect(await mine("2026-10-24T06:40:00Z")).toEqual([{ userId: u.id, spaceId: s.id }]); // 07:40 in Lagos
    expect(await mine("2026-10-24T06:20:00Z")).toEqual([]); // 07:20: not yet
    expect(await mine("2026-10-24T07:10:00Z")).toEqual([]); // 08:10: window passed
    await sql`insert into briefs (user_id, space_id, kind, period_key, markdown, created_at) values (${u.id}, ${s.id}, 'daily', '2026-10-24', 'y', '2026-10-24T07:00:00Z')`;
    expect(await mine("2026-10-24T06:40:00Z")).toEqual([]);
    // Briefs nobody has opened in a week aren't prepared.
    expect(await mine("2026-11-02T06:40:00Z")).toEqual([]);
  });
});

describe("delete account", () => {
  it("revokes Google, removes every row the user owns and the sign-in, and leaves others alone", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchSpy = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const bobBefore = await sql`select count(*)::int as n from people where user_id = ${bob.id}`;

    await deleteAccount(ada.id, { sys, fetch: fetchSpy, supabaseUrl: "https://project.supabase.example", serviceRoleKey: "service-key" });

    expect(calls.some((c) => c.url.includes("revoke") && c.url.includes("secret-refresh"))).toBe(true);
    const admin = calls.find((c) => c.url === `https://project.supabase.example/auth/v1/admin/users/${ada.id}`);
    expect(admin?.init?.method).toBe("DELETE");
    expect((admin?.init?.headers as Record<string, string>).Authorization).toBe("Bearer service-key");

    expect(await sql`select 1 from auth.users where id = ${ada.id}`).toHaveLength(0);
    const tables = await sql`
      select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_name = c.table_name and t.table_schema = c.table_schema and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'user_id'`;
    expect(tables.length).toBeGreaterThan(20);
    for (const { table_name } of tables) {
      const [{ n }] = await sql`select count(*)::int as n from ${sql(table_name)} where user_id = ${ada.id}`;
      expect({ table: table_name, n }).toEqual({ table: table_name, n: 0 });
    }
    expect(await sql`select count(*)::int as n from people where user_id = ${bob.id}`).toEqual(bobBefore);
  });

  it("works without a service key by deleting the auth row directly", async () => {
    const u = await createUser(sql, "No Key");
    await deleteAccount(u.id, { sys, fetch: (async () => new Response(null)) as typeof fetch, supabaseUrl: "", serviceRoleKey: "" });
    expect(await sql`select 1 from profiles where user_id = ${u.id}`).toHaveLength(0);
  });
});
