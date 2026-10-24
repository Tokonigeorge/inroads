import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readQuickCapture } from "@/server/capture/quick";
import type { Tx } from "@/server/db/with-user";
import { createPerson } from "@/server/repos/people";
import { listSpaces } from "@/server/repos/spaces";
import { fakeAnthropic, promptText } from "../fixtures/fake-anthropic";
import { connect, createUser } from "./helpers";

process.env.ANTHROPIC_API_KEY ??= "test-key";
const { sql, db, sys } = connect();
const today = "2026-10-24";
let user: { id: string };
let work: string;
let personal: string;
const ada = randomUUID();
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

beforeAll(async () => {
  user = await createUser(sql, "Quick Capturer");
  const spaces = await as((tx) => listSpaces(tx));
  work = spaces.find((s) => s.kind === "work")!.id;
  personal = spaces.find((s) => s.kind === "personal")!.id;
  await as((tx) => createPerson(tx, user.id, { id: ada, identity: { name: "Ada Obi", company: "Paystack" }, membership: { spaceId: work } }, today));
  await as((tx) => createPerson(tx, user.id, { id: randomUUID(), identity: { name: "Adaku Eze" }, membership: { spaceId: personal } }, today));
});

const read = (line: string, client: ReturnType<typeof fakeAnthropic>["client"], spaceId = work) => as((tx) => readQuickCapture(tx, { client, sys }, user.id, { line, spaceId, today }));

describe("quick capture", () => {
  it("reads the line with the fast model and offers matching people from that Space only", async () => {
    const fake = fakeAnthropic(() => ({
      json: { name: "Ada", company: "Paystack", position: "Partnerships", touched: true, touchType: "meeting", touchDate: "2026-10-24", promises: [{ text: "Intro to Tola", owner: "me", due: "2026-10-30" }], followUpDate: "not a date" },
    }));
    const r = await read("Met Ada, partnerships @ Paystack, wants intro to Tola by Friday", fake.client);
    expect(r.source).toBe("ai");
    expect(fake.calls[0].model).toBe("claude-haiku-5-5");
    expect(promptText(fake.calls[0])).toContain("Today is Saturday 2026-10-24");
    expect(r.draft).toMatchObject({ name: "Ada", touch: { type: "meeting", occurredOn: today }, promises: [{ text: "Intro to Tola", owner: "me", dueOn: "2026-10-30" }], followUpOn: null });
    expect(r.candidates).toEqual([{ id: ada, name: "Ada Obi", detail: "Paystack" }]);
    // Adaku is only in Personal, so she isn't offered for a Work capture.
    expect(r.candidates.map((c) => c.name)).not.toContain("Adaku Eze");
  });

  it("never dates a touch in the future", async () => {
    const fake = fakeAnthropic(() => ({ json: { name: "Ada", company: "", position: "", touched: true, touchType: "call", touchDate: "2026-12-01", promises: [], followUpDate: "" } }));
    expect((await read("Called Ada", fake.client)).draft.touch?.occurredOn).toBe(today);
  });

  it("falls back to the rules parser when the model fails or the limit is reached", async () => {
    const refused = fakeAnthropic(() => ({ text: "", stop: "refusal" }));
    const r = await read("Coffee with Ada yesterday, I'll send the deck tomorrow", refused.client);
    expect(r.source).toBe("rules");
    expect(r.draft).toMatchObject({ name: "Ada", touch: { type: "coffee", occurredOn: "2026-10-23" }, promises: [{ text: "Send the deck", owner: "me", dueOn: "2026-10-25" }] });
    expect(r.candidates.map((c) => c.id)).toEqual([ada]);

    for (let i = 0; i < 60; i++) await sql`insert into ai_usage (user_id, feature, model, cost_micro_usd) values (${user.id}, 'capture', 'm', 0)`;
    const unused = fakeAnthropic(() => ({ text: "x" }));
    expect((await read("Met Ada", unused.client)).source).toBe("rules");
    expect(unused.calls).toHaveLength(0);
  });
});
