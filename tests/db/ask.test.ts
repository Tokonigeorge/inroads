import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Tx } from "@/server/db/with-user";
import { createPerson, logTouch } from "@/server/repos/people";
import { listSpaces } from "@/server/repos/spaces";
import { askNetwork, findCandidates } from "@/server/search/ask";
import { fakeAnthropic, promptText } from "../fixtures/fake-anthropic";
import { connect, createUser } from "./helpers";

process.env.ANTHROPIC_API_KEY ??= "test-key";
const TODAY = "2026-10-24";
const { sql, db, sys } = connect();
let user: { id: string };
let work: string;
let personal: string;
const kemi = randomUUID();
const kofi = randomUUID();
const tunde = randomUUID();
const ama = randomUUID();
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

beforeAll(async () => {
  user = await createUser(sql, "Network Asker");
  const spaces = await as((tx) => listSpaces(tx));
  work = spaces.find((s) => s.kind === "work")!.id;
  personal = spaces.find((s) => s.kind === "personal")!.id;
  await as((tx) => createPerson(tx, user.id, { id: kemi, identity: { name: "Kemi Adebayo", company: "Kestrel Ventures", position: "Partner", city: "Accra" }, membership: { spaceId: work, notes: "Led their seed round in a payments startup", interests: "fintech" } }, TODAY));
  await as((tx) => createPerson(tx, user.id, { id: kofi, identity: { name: "Kofi Mensah", city: "Accra" }, membership: { spaceId: work, tags: "design" } }, TODAY));
  await as((tx) => createPerson(tx, user.id, { id: tunde, identity: { name: "Tunde Bakare", company: "Paystack" }, membership: { spaceId: work } }, TODAY));
  await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: tunde, spaceId: work, occurredOn: TODAY, type: "coffee", summary: "Talked fintech hiring" }));
  // Same words, other Space: never part of a Work answer.
  await as((tx) => createPerson(tx, user.id, { id: ama, identity: { name: "Ama Owusu", city: "Accra" }, membership: { spaceId: personal, notes: "fintech friend" } }, TODAY));
});

describe("ask your network", () => {
  it("finds people by their details, notes and touches in one Space, best matches first", async () => {
    const found = await as((tx) => findCandidates(tx, work, ["fintech", "accra"]));
    expect(found.map((c) => [c.name, c.found])).toEqual([
      ["Kemi Adebayo", ["fintech", "accra"]],
      ["Kofi Mensah", ["accra"]],
      ["Tunde Bakare", ["fintech"]],
    ]);
    expect(found.map((c) => c.name)).not.toContain("Ama Owusu");
  });

  it("with AI: widens the terms, then ranks with reasons, keeping only real people from the list", async () => {
    const fake = fakeAnthropic((req, n) =>
      n === 1
        ? { json: { terms: ["fintech", "payments", "seed", "accra"] } }
        : { json: { matches: [{ id: kemi, why: "Partner at Kestrel in Accra; your notes say she led a payments seed round" }, { id: randomUUID(), why: "Invented" }, { id: ama, why: "Other Space" }] } },
    );
    const r = await as((tx) => askNetwork(tx, { client: fake.client, sys }, user.id, { spaceId: work, question: "Who do I know in fintech in Accra who's raised before?" }));
    expect(r.source).toBe("ai");
    expect(r.matches).toEqual([{ id: kemi, name: "Kemi Adebayo", detail: "Partner at Kestrel Ventures", why: "Partner at Kestrel in Accra; your notes say she led a payments seed round" }]);
    expect(promptText(fake.calls[1])).not.toContain("Ama Owusu");
    expect(fake.calls).toHaveLength(2);
    const [{ n }] = await sql`select count(*)::int as n from ai_usage where user_id = ${user.id} and feature = 'ask'`;
    expect(n).toBe(2);
  });

  it("without AI (or if it fails): word matches with the words they matched", async () => {
    const broken = fakeAnthropic(() => ({ text: "", stop: "refusal" }));
    const r = await as((tx) => askNetwork(tx, { client: broken.client, sys }, user.id, { spaceId: work, question: "anyone in Accra?" }));
    expect(r).toMatchObject({ source: "words", terms: ["accra"] });
    expect(r.matches.map((m) => [m.name, m.why])).toEqual([
      ["Kemi Adebayo", "Mentions accra"],
      ["Kofi Mensah", "Mentions accra"],
    ]);
  });
});
