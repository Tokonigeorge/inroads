import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IncomingContact } from "@/domain/dedupe";
import type { IcsEvent } from "@/importers/ics";
import type { Tx } from "@/server/db/with-user";
import { applyCalendar } from "@/server/import/calendar";
import { applyContacts } from "@/server/import/contacts";
import { startImport } from "@/server/import/imports";
import { acceptSuggestedSort, applyTriage, computeTriageSuggestions, listTriage, undoImport } from "@/server/import/triage";
import { createPerson } from "@/server/repos/people";
import { listSpaces } from "@/server/repos/spaces";
import { connect, createUser } from "./helpers";

const { sql, db } = connect();
const TODAY = "2026-10-24";
let user: { id: string };
let work: string;
let personal: string;
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

const contact = (o: Partial<IncomingContact>): IncomingContact => ({
  name: "?",
  hasName: true,
  emails: [],
  phones: [],
  company: null,
  position: null,
  city: null,
  birthday: null,
  socials: {},
  externalId: null,
  labels: [],
  starred: false,
  ...o,
});
const event = (o: Partial<IcsEvent>): IcsEvent => ({
  uid: "e1",
  summary: "Meeting",
  location: "",
  description: "",
  start: { date: "2026-10-01", time: "10:00", tz: "Africa/Lagos" },
  end: null,
  allDay: false,
  rrule: null,
  status: "CONFIRMED",
  isException: false,
  attendees: [],
  ...o,
});
const att = (email: string, status = "ACCEPTED", name = "") => ({ name, email, role: "ATTENDEE" as const, status, resource: false });

beforeAll(async () => {
  user = await createUser(sql, "Importer");
  const spaces = await as((tx) => listSpaces(tx));
  work = spaces.find((s) => s.kind === "work")!.id;
  personal = spaces.find((s) => s.kind === "personal")!.id;
  await as((tx) =>
    createPerson(tx, user.id, { id: crypto.randomUUID(), identity: { name: "Tunde Bakare", emails: ["tunde@meridian.example"], phones: ["0803 123 4567"] }, membership: { spaceId: work } }, TODAY),
  );
  await as((tx) => createPerson(tx, user.id, { id: crypto.randomUUID(), identity: { name: "David Okafor", phones: ["0800 000 0001"] }, membership: { spaceId: personal } }, TODAY));
});

describe("importing contacts and a calendar", () => {
  let importId: string;

  it("adds new people for sorting, fills blanks on known ones, and flags same-name duplicates", async () => {
    const imp = await as((tx) => startImport(tx, { userId: user.id, spaceId: work, type: "google" }));
    importId = imp.id;
    const summary = await as((tx) =>
      applyContacts(tx, { userId: user.id, importId, spaceId: work, today: TODAY, source: "google" }, [
        contact({ name: "Tunde B.", phones: ["+2348031234567"], position: "Head of Procurement", externalId: "google:people/c1" }),
        contact({ name: "David Okafor", phones: ["+2348099999999"], externalId: "google:people/c2" }),
        contact({ name: "Kemi Adebayo", emails: ["kemi@paystack.example"], starred: true, labels: ["Investors"], externalId: "google:people/c3" }),
        contact({ name: "+2348012345678", hasName: false, phones: ["+2348012345678"], externalId: "google:people/c4" }),
      ]),
    );
    expect(summary).toEqual({ found: 4, added: 3, updated: 1, unchanged: 0, possibleDuplicates: 1 });
    const [tunde] = await sql`select position, external_refs from people where user_id = ${user.id} and name = 'Tunde Bakare'`;
    expect(tunde).toEqual({ position: "Head of Procurement", external_refs: { google: "people/c1" } });
    const dupes = await sql`select payload, why from suggestions where user_id = ${user.id} and kind = 'merge'`;
    expect(dupes).toHaveLength(1);
    const [kemi] = await sql`select ps.tags, ps.triage_state from person_spaces ps join people p on p.id = ps.person_id where p.user_id = ${user.id} and p.name = 'Kemi Adebayo'`;
    expect(kemi).toEqual({ tags: ["investors"], triage_state: "pending" });
  });

  it("is safe to run again: nothing doubles", async () => {
    const summary = await as((tx) =>
      applyContacts(tx, { userId: user.id, importId, spaceId: work, today: TODAY, source: "google" }, [
        contact({ name: "Kemi Adebayo", emails: ["kemi@paystack.example"], externalId: "google:people/c3" }),
      ]),
    );
    expect(summary).toMatchObject({ added: 0, unchanged: 1 });
  });

  it("logs past meetings, adds guests, creates rooms for upcoming meetings and skips declined ones", async () => {
    const summary = await as((tx) =>
      applyCalendar(tx, { userId: user.id, importId, spaceId: work, today: TODAY, source: "google", meEmails: ["me@example.com"], connectionId: null }, [
        event({ uid: "weekly", summary: "Pricing sync", rrule: "FREQ=WEEKLY", start: { date: "2026-10-01", time: "09:00", tz: "Africa/Lagos" }, attendees: [att("me@example.com"), att("tunde@meridian.example"), att("new.person@lumen.example", "ACCEPTED", "Ifeoma Nwosu")] }),
        event({ uid: "declined", attendees: [att("me@example.com", "DECLINED"), att("tunde@meridian.example")] }),
        event({ uid: "cancelled", status: "CANCELLED", attendees: [att("tunde@meridian.example")] }),
        event({ uid: "solo", summary: "Focus time", start: { date: "2026-10-30", time: "09:00", tz: "Africa/Lagos" } }),
      ]),
    );
    // Weekly from 1 Oct: 1, 8, 15, 22 Oct are past (4 sessions) for Tunde and the new guest.
    expect(summary).toMatchObject({ events: 4, skipped: 2, logged: 8, peopleTouched: 2, newPeople: 1, rooms: 1 });
    const [room] = await sql`select title, rrule, tz from events where user_id = ${user.id} and external_id = 'weekly'`;
    expect(room).toEqual({ title: "Pricing sync", rrule: "FREQ=WEEKLY", tz: "Africa/Lagos" });
    const [att2] = await sql`select count(*)::int as n from event_attendance where user_id = ${user.id}`;
    expect(att2.n).toBe(4); // you accepted the series, so the past sessions count as attended
  });

  it("running the calendar again logs nothing new", async () => {
    const summary = await as((tx) =>
      applyCalendar(tx, { userId: user.id, importId, spaceId: work, today: TODAY, source: "google", meEmails: ["me@example.com"], connectionId: null }, [
        event({ uid: "weekly", summary: "Pricing sync", rrule: "FREQ=WEEKLY", start: { date: "2026-10-01", time: "09:00", tz: "Africa/Lagos" }, attendees: [att("me@example.com"), att("tunde@meridian.example")] }),
      ]),
    );
    expect(summary.logged).toBe(0);
  });

  it("suggests a sort with reasons, and accepting it sorts everyone in one go", async () => {
    await as((tx) => computeTriageSuggestions(tx, { today: TODAY, importId }));
    const triage = await as((tx) => listTriage(tx, work));
    const by = Object.fromEntries(triage.items.map((i) => [i.name, i.suggestion]));
    expect(by["Kemi Adebayo"]).toEqual({ action: "priority", reason: "Starred in Google" });
    expect(by["Ifeoma Nwosu"]).toEqual({ action: "priority", reason: "4 meetings in the last 6 months" });
    expect(by["+2348012345678"]).toEqual({ action: "not_now", reason: "No name saved, just a number or address" });
    expect(by["David Okafor"]).toEqual({ action: "not_now", reason: "No meetings or details yet" });
    expect(triage.total).toBe(4);

    const david = triage.items.find((i) => i.name === "David Okafor")!;
    await as((tx) => applyTriage(tx, [{ membershipId: david.membershipId, action: "keep", cadenceDays: 30 }]));
    const result = await as((tx) => acceptSuggestedSort(tx, work));
    expect(result).toEqual({ priority: 2, not_now: 1 });
    expect((await as((tx) => listTriage(tx, work))).total).toBe(0);
    const [nameless] = await sql`select ps.archived_at is not null as archived from person_spaces ps join people p on p.id = ps.person_id where p.user_id = ${user.id} and p.name = '+2348012345678'`;
    expect(nameless.archived).toBe(true);
  });

  it("can be undone, leaving people you already had", async () => {
    await as((tx) => undoImport(tx, importId));
    const names = (await sql`select name from people where user_id = ${user.id} order by name`).map((r) => r.name);
    expect(names).toEqual(["David Okafor", "Tunde Bakare"]);
    const [{ n }] = await sql`select count(*)::int as n from interactions where user_id = ${user.id}`;
    expect(n).toBe(0);
    const [{ e }] = await sql`select count(*)::int as e from events where user_id = ${user.id}`;
    expect(e).toBe(0);
  });
});
