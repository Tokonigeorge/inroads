import { randomBytes, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { todayIn } from "@/domain/dates";
import { createPerson } from "@/server/repos/people";
import { listSpaces } from "@/server/repos/spaces";
import { runConnectionSync } from "@/server/sync/run-sync";
import { connectionsStore } from "@/server/system/connections";
import { jobsStore } from "@/server/system/jobs";
import { FAKE_GOOGLE_EMAIL, fakeGoogleFetch } from "../fixtures/fake-google";
import { connect, createUser } from "./helpers";

process.env.TOKEN_ENC_KEYS = JSON.stringify({ v1: randomBytes(32).toString("base64") });
process.env.TOKEN_ENC_CURRENT = "v1";

const { sql, db, sys } = connect();
const today = todayIn("Africa/Lagos");
const deps = { fetch: fakeGoogleFetch(today), db, sys, env: { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" } };
let user: { id: string };
let work: string;
afterAll(() => sql.end());

beforeAll(async () => {
  user = await createUser(sql, "Ada Google");
  work = (await db.withUser(user.id, (tx) => listSpaces(tx))).find((s) => s.kind === "work")!.id;
  await db.withUser(user.id, (tx) =>
    createPerson(tx, user.id, { id: randomUUID(), identity: { name: "Tunde B", phones: ["+234 803 123 4567"] }, membership: { spaceId: work } }, today),
  );
});

async function connectGoogle(refresh = "fake-refresh", expired = true) {
  return connectionsStore(sys).upsert({
    userId: user.id,
    provider: "google",
    accountEmail: FAKE_GOOGLE_EMAIL,
    scopes: ["https://www.googleapis.com/auth/contacts.readonly", "https://www.googleapis.com/auth/calendar.events.readonly", "https://www.googleapis.com/auth/calendar.calendarlist.readonly"],
    spaceId: work,
    tokens: { access_token: "old", refresh_token: refresh, expires_at: expired ? 0 : Date.now() + 3_600_000, scope: "" },
  });
}

describe("Google sync", () => {
  let connectionId: string;

  it("stores tokens encrypted and unreadable to the user", async () => {
    connectionId = await connectGoogle();
    const [row] = await sql`select tokens_enc from connections where id = ${connectionId}`;
    expect(Buffer.from(row.tokens_enc).toString("utf8")).not.toContain("fake-refresh");
    expect((await connectionsStore(sys).get(connectionId))?.tokens?.refresh_token).toBe("fake-refresh");
  });

  it("imports contacts and calendar, with live progress, and lands people in triage", async () => {
    const jobId = await jobsStore(sys).create(user.id, "sync:google");
    const r = await runConnectionSync(connectionId, jobId, deps);
    expect(r.contacts).toEqual({ found: 3, added: 2, updated: 1, unchanged: 0, possibleDuplicates: 0 });
    expect(r.calendar).toMatchObject({ skipped: 1, newPeople: 1, rooms: 2 });
    expect(r.calendar!.logged).toBeGreaterThanOrEqual(6); // 3 past weekly sessions × Tunde and Ifeoma

    const [job] = await sql`select status, progress, result_ref from jobs where id = ${jobId}`;
    expect(job.status).toBe("done");
    expect(job.result_ref.importId).toBe(r.importId);

    const people = await sql`select p.name, p.emails, p.company, ps.triage_state, ps.triage_suggestion ->> 'action' as action, ps.triage_suggestion ->> 'reason' as reason
      from people p join person_spaces ps on ps.person_id = p.id where p.user_id = ${user.id} order by p.name`;
    expect(people.map((p) => [p.name, p.triage_state, p.action])).toEqual([
      ["+2348123456789", "pending", "not_now"],
      ["Ifeoma Nwosu", "pending", "priority"],
      ["Kemi Adebayo", "pending", "priority"],
      ["Tunde B", "done", null], // existing person: filled in, not re-triaged
    ]);
    const tunde = people.find((p) => p.name === "Tunde B")!;
    expect(tunde).toMatchObject({ company: "Meridian Telecoms", emails: ["tunde@meridian.example"] });

    const rooms = await sql`select title, rrule from events where user_id = ${user.id} order by title`;
    expect(rooms.map((x) => [x.title, x.rrule])).toEqual([
      ["Pitch rehearsal", null],
      ["Pricing sync", "FREQ=WEEKLY"],
    ]);
    const state = (await connectionsStore(sys).get(connectionId))!;
    expect(state.syncState.contacts?.syncToken).toBe("people-sync-1");
    expect(state.tokens?.access_token).toBe("fake-access"); // refreshed and saved
  });

  it("a second sync uses sync tokens and adds nothing", async () => {
    const jobId = await jobsStore(sys).create(user.id, "sync:google");
    const r = await runConnectionSync(connectionId, jobId, deps);
    expect(r.contacts).toBeNull();
    expect(r.calendar).toBeNull();
    const [{ n }] = await sql`select count(*)::int as n from people where user_id = ${user.id}`;
    expect(n).toBe(4);
  });

  it("asks the user to reconnect when Google refuses the refresh token", async () => {
    const id = await connectionsStore(sys).upsert({
      userId: user.id,
      provider: "google",
      accountEmail: "second@example.test",
      scopes: [],
      spaceId: work,
      tokens: { access_token: "x", refresh_token: "revoked", expires_at: 0, scope: "" },
    });
    const jobId = await jobsStore(sys).create(user.id, "sync:google");
    await runConnectionSync(id, jobId, deps);
    const [job] = await sql`select status, error from jobs where id = ${jobId}`;
    expect(job).toEqual({ status: "failed", error: expect.stringContaining("needs you to reconnect") });
    const [conn] = await sql`select status, last_error from connections where id = ${id}`;
    expect(conn).toEqual({ status: "error", last_error: "reconnect" });
  });

  it("users can see their own connections and jobs, but not tokens, and not other people's", async () => {
    const asUser = (id: string, q: (tx: postgres.TransactionSql) => PromiseLike<readonly unknown[]>) =>
      sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id })}, true), set_config('role', 'authenticated', true)`;
        return [...(await q(tx))];
      });
    expect((await asUser(user.id, (tx) => tx`select id, status, account_email from connections`)).length).toBe(2);
    expect((await asUser(user.id, (tx) => tx`select id from jobs`)).length).toBeGreaterThan(0);
    const other = await createUser(sql, "Other");
    expect(await asUser(other.id, (tx) => tx`select id from jobs`)).toHaveLength(0);
    expect(await asUser(other.id, (tx) => tx`select id from connections`)).toHaveLength(0);
  });
});

describe("Google sync for a new account (what Google actually granted)", () => {
  const GRANTS = {
    contacts: "https://www.googleapis.com/auth/contacts.readonly",
    events: "https://www.googleapis.com/auth/calendar.events.readonly",
    list: "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  };
  async function fresh(scopes: string[], fetchImpl = deps.fetch) {
    const u = await createUser(sql, "New Googler");
    const space = (await db.withUser(u.id, (tx) => listSpaces(tx))).find((s) => s.kind === "work")!.id;
    const id = await connectionsStore(sys).upsert({
      userId: u.id,
      provider: "google",
      accountEmail: FAKE_GOOGLE_EMAIL,
      scopes,
      spaceId: space,
      tokens: { access_token: "old", refresh_token: "fake-refresh", expires_at: 0, scope: "" },
    });
    const jobId = await jobsStore(sys).create(u.id, "sync:google");
    const r = await runConnectionSync(id, jobId, { ...deps, fetch: fetchImpl, skipPrep: true });
    const [job] = await sql`select status, error from jobs where id = ${jobId}`;
    return { r, job };
  }

  it("a calendar it can't read (free/busy only) is skipped, and the rest syncs", async () => {
    const base = fakeGoogleFetch(today);
    const withBusyOnly = async (input: string, init?: RequestInit) => {
      const u = new URL(input);
      if (u.pathname === "/calendar/v3/users/me/calendarList") {
        const list = (await (await base(input, init)).json()) as { items: object[] };
        return Response.json({ items: [...list.items, { id: "busy@group.calendar.google.com", selected: true, accessRole: "owner", summary: "Team" }] });
      }
      if (u.pathname.includes("busy%40group")) return Response.json({ error: { code: 403 } }, { status: 403 });
      return base(input, init);
    };
    const { r, job } = await fresh([GRANTS.contacts, GRANTS.events, GRANTS.list], withBusyOnly);
    expect(job.status).toBe("done");
    expect(r.contacts?.added).toBeGreaterThan(0);
    expect(r.calendar?.rooms).toBeGreaterThan(0);
  });

  it("only contacts shared: contacts sync, the calendar isn't read", async () => {
    const { r, job } = await fresh([GRANTS.contacts]);
    expect(job.status).toBe("done");
    expect(r.contacts?.added).toBeGreaterThan(0);
    expect(r.calendar).toBeNull();
  });

  it("nothing shared: asks to reconnect and tick the boxes, instead of failing quietly", async () => {
    const { job } = await fresh(["openid", "email"]);
    expect(job).toEqual({ status: "failed", error: expect.stringContaining("tick both boxes") });
  });

  it("a Google outage while renewing access keeps the account syncing, instead of asking to reconnect", async () => {
    const id = await connectionsStore(sys).upsert({
      userId: user.id,
      provider: "google",
      accountEmail: "outage@example.test",
      scopes: [],
      spaceId: work,
      tokens: { access_token: "x", refresh_token: "outage", expires_at: 0, scope: "" },
    });
    const jobId = await jobsStore(sys).create(user.id, "sync:google");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runConnectionSync(id, jobId, deps)).rejects.toThrow();
    const [job] = await sql`select status, error from jobs where id = ${jobId}`;
    expect(job).toEqual({ status: "failed", error: expect.stringContaining("try again shortly") });
    const [conn] = await sql`select status, last_error from connections where id = ${id}`;
    expect(conn).toEqual({ status: "active", last_error: "provider 503" });
    expect((await connectionsStore(sys).due(["google"], 25)).map((c) => c.id)).toContain(id);
  });
});
