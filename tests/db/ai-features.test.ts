import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayIn } from "@/domain/dates";
import { draftMessage, importChat, lookUp, researchPerson, scorePeople, writeBrief } from "@/server/ai/features";
import type { Tx } from "@/server/db/with-user";
import { runAiJob } from "@/server/jobs/ai-jobs";
import { createGoal } from "@/server/repos/goals";
import { createPerson, logTouch, saveMembership } from "@/server/repos/people";
import { acceptSuggestion, discardSuggestion, pendingForPerson } from "@/server/repos/suggestions";
import { listSpaces } from "@/server/repos/spaces";
import { jobsStore } from "@/server/system/jobs";
import { fakeAnthropic, promptText, type FakeRequest } from "../fixtures/fake-anthropic";
import { connect, createUser } from "./helpers";

process.env.ANTHROPIC_API_KEY ??= "test-key";
const { sql, db, sys } = connect();
const TODAY = todayIn("Africa/Lagos");
let user: { id: string };
let work: string;
let dating: string;
let goalId: string;
const kemi = randomUUID();
const sade = randomUUID();
afterAll(() => sql.end());
const as = <T,>(fn: (tx: Tx) => Promise<T>) => db.withUser(user.id, fn);

beforeAll(async () => {
  user = await createUser(sql, "AI Features");
  const spaces = await as((tx) => listSpaces(tx));
  work = spaces.find((s) => s.kind === "work")!.id;
  dating = spaces.find((s) => s.kind === "dating")!.id;
  const g = await as((tx) => createGoal(tx, user.id, { text: "Raise a pre-seed round", spaceId: work, type: "capital", priority: 1, weeklyTarget: 3, stages: null }));
  if (!g.ok) throw new Error(g.message);
  goalId = g.data.id;
  await as((tx) => createPerson(tx, user.id, { id: kemi, identity: { name: "Kemi Adebayo", socials: { linkedin: "https://www.linkedin.com/in/kemi" } }, membership: { spaceId: work, notes: "WORK-ONLY: wants a term sheet" } }, TODAY));
  await as((tx) => saveMembership(tx, user.id, kemi, { spaceId: dating, notes: "DATING-ONLY: loves salsa" }, TODAY));
  await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: kemi, spaceId: dating, occurredOn: TODAY, type: "message", summary: "DATING-TOUCH: planned a dinner" }));
  await as((tx) => createPerson(tx, user.id, { id: sade, identity: { name: "Sade Lawal" }, membership: { spaceId: dating } }, TODAY));
});

const research = {
  identity: "Kemi Adebayo, partner at Kestrel",
  matched: ["LinkedIn"],
  conflicts: [],
  summary: "Early-stage investor in Lagos.",
  career: ["Partner, Kestrel"],
  company: "Kestrel Ventures invests in fintech",
  signals: [],
  sharedInterests: [],
  talkingPoints: ["Ask about their fintech thesis"],
  opportunities: ["Pitch the pre-seed"],
  profiles: { linkedin: "https://www.linkedin.com/in/kemi", x: "https://x.com/kemi", instagram: "", github: "", substack: "", website: "" },
  found: { position: "Partner", company: "Kestrel Ventures", city: "Lagos", birthday: "" },
  score: 88,
  scoreWhy: "Invests at your stage",
  confidence: "high",
  caveats: "",
  sources: [{ title: "Kestrel team", url: "https://kestrel.example/team" }],
};

describe("research", () => {
  it("Work: a dossier, a score, and suggestions only for what's missing", async () => {
    const fake = fakeAnthropic(() => ({ json: { ...research, goalId } }));
    const r = await researchPerson({ client: fake.client, sys, db }, user.id, { personId: kemi, spaceId: work, mode: "research" });
    const prompt = promptText(fake.calls[0]);
    expect(prompt).toContain("WORK-ONLY");
    expect(prompt).not.toContain("DATING-ONLY");
    expect(prompt).not.toContain("DATING-TOUCH");
    const [d] = await sql`select mode, version, confidence, prompt_version, sources from dossiers where id = ${r.dossierId}`;
    expect(d).toMatchObject({ mode: "full", version: 1, confidence: "high", prompt_version: "research.full@1" });
    const s = await as((tx) => pendingForPerson(tx, kemi));
    expect(s.map((x) => x.kind).sort()).toEqual(["goal_link", "person_field", "person_field", "person_field", "social"]); // linkedin already saved
    const [score] = await sql`select value, goal_id from scores where person_id = ${kemi}`;
    expect(score).toEqual({ value: 88, goal_id: goalId });
  });

  it("Dating: get to know, with no Work context, and no fields for the banned categories", async () => {
    const fake = fakeAnthropic(() => ({ json: { identity: "Kemi", sharedInterests: [{ text: "Salsa", url: "https://instagram.com/p/1" }], thingsToAsk: [{ text: "Favourite salsa spot?", url: "" }], funFacts: [], confidence: "medium", caveats: "", sources: [], family: "should be dropped" } }));
    const r = await researchPerson({ client: fake.client, sys, db }, user.id, { personId: kemi, spaceId: dating, mode: "research" });
    const req = fake.calls[0];
    const prompt = promptText(req);
    expect(prompt).toContain("DATING-ONLY");
    expect(prompt).not.toContain("WORK-ONLY");
    expect(prompt).not.toContain("Raise a pre-seed round");
    expect(prompt).toMatch(/Never include, even if you find it: family/);
    expect(req.model).toBe("claude-opus-5-5");
    const [d] = await sql`select mode, payload from dossiers where id = ${r.dossierId}`;
    expect(d.mode).toBe("get_to_know");
    expect(Object.keys(d.payload).sort()).toEqual(["caveats", "funFacts", "identity", "sharedInterests", "thingsToAsk"]);
  });

  it("Verify is a yes/no/unclear check", async () => {
    const fake = fakeAnthropic(() => ({ json: { answer: "yes", summary: "Profile exists", redFlags: [], sources: [] } }));
    const r = await researchPerson({ client: fake.client, sys, db }, user.id, { personId: sade, spaceId: dating, mode: "verify" });
    const [d] = await sql`select mode, confidence from dossiers where id = ${r.dossierId}`;
    expect(d).toEqual({ mode: "verify", confidence: "yes" });
  });

  it("refuses people outside the Space", async () => {
    const fake = fakeAnthropic(() => ({ json: research }));
    await expect(researchPerson({ client: fake.client, sys, db }, user.id, { personId: sade, spaceId: work, mode: "research" })).rejects.toThrow(/not in this Space/);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("suggestions", () => {
  it("accept applies the change, edit changes the value, discard leaves things alone", async () => {
    const s = await as((tx) => pendingForPerson(tx, kemi));
    const company = s.find((x) => x.kind === "person_field" && (x.payload as { field: string }).field === "company")!;
    const city = s.find((x) => x.kind === "person_field" && (x.payload as { field: string }).field === "city")!;
    const goal = s.find((x) => x.kind === "goal_link")!;
    const social = s.find((x) => x.kind === "social")!;
    expect(await as((tx) => acceptSuggestion(tx, user.id, company.id))).toEqual({ ok: true, data: null });
    expect(await as((tx) => acceptSuggestion(tx, user.id, city.id, "Ikoyi, Lagos"))).toEqual({ ok: true, data: null });
    expect(await as((tx) => acceptSuggestion(tx, user.id, goal.id))).toEqual({ ok: true, data: null });
    await as((tx) => discardSuggestion(tx, social.id));
    const [p] = await sql`select company, city, socials from people where id = ${kemi}`;
    expect(p).toEqual({ company: "Kestrel Ventures", city: "Ikoyi, Lagos", socials: { linkedin: "https://www.linkedin.com/in/kemi" } });
    expect(await sql`select stage from goal_links where person_id = ${kemi}`).toHaveLength(1);
    expect(await as((tx) => acceptSuggestion(tx, user.id, company.id))).toMatchObject({ ok: false });
  });
});

describe("look up, briefs, scores, chat, drafts", () => {
  it("look up keeps only warm paths to people in this Space", async () => {
    const fake = fakeAnthropic((req: FakeRequest) => {
      const network = promptText(req);
      expect(network).toContain(kemi);
      expect(network).not.toContain(sade);
      return { json: { title: "Kestrel Ventures", kind: "company", overview: "VC", facts: [], website: "https://kestrel.example", stakeholders: [], warmPaths: [{ contactId: kemi, how: "Works there", angle: "Intro" }, { contactId: sade, how: "x", angle: "x" }, { contactId: "made-up", how: "x", angle: "x" }], opportunities: [], playbook: [], confidence: "high", verify: "", sources: [] } };
    });
    const r = await lookUp({ client: fake.client, sys, db }, user.id, { spaceId: work, type: "company", q: "Kestrel Ventures" });
    const [s] = await sql`select type, result from searches where id = ${r.searchId}`;
    expect(s.type).toBe("company");
    expect(s.result.warmPaths.map((w: { contactId: string }) => w.contactId)).toEqual([kemi]);
  });

  it("briefs are per Space", async () => {
    const fake = fakeAnthropic(() => ({ text: "## Today's rooms\nNothing on today." }));
    const r = await writeBrief({ client: fake.client, sys, db }, user.id, { spaceId: work, kind: "daily" });
    expect(promptText(fake.calls[0])).not.toContain("DATING");
    const [b] = await sql`select kind, period_key, markdown from briefs where id = ${r.briefId}`;
    expect(b).toEqual({ kind: "daily", period_key: TODAY, markdown: "## Today's rooms\nNothing on today." });
    // Rewriting today's brief replaces it.
    const again = await writeBrief({ client: fakeAnthropic(() => ({ text: "v2" })).client, sys, db }, user.id, { spaceId: work, kind: "daily" });
    expect(again.briefId).toBe(r.briefId);
  });

  it("scores become goal suggestions, never silent links", async () => {
    const other = randomUUID();
    await as((tx) => createPerson(tx, user.id, { id: other, identity: { name: "Tunde Bakare" }, membership: { spaceId: work } }, TODAY));
    const fake = fakeAnthropic(() => ({ json: { scores: [{ id: other, score: 75, why: "Buys telecoms", goalId }, { id: randomUUID(), score: 99, why: "not real", goalId }] } }));
    const r = await scorePeople({ client: fake.client, sys, db }, user.id, { spaceId: work });
    expect(r).toEqual({ scored: 1, suggestions: 1 });
    expect(fake.calls[0].model).toBe("claude-haiku-5-5");
    expect(await sql`select 1 from goal_links where person_id = ${other}`).toHaveLength(0);
  });

  it("chat import suggests touches and promises, and stores no transcript", async () => {
    const fake = fakeAnthropic(() => ({ json: { summary: "Warm", lastDate: TODAY, interactions: [{ date: TODAY, summary: "Agreed to meet" }], commitments: [{ text: "Send the deck", owner: "me", due: "" }], details: { company: "", position: "Partner", interests: ["fintech"], birthday: "" }, sentiment: "warm", nextStep: "Book a coffee" } }));
    const r = await importChat({ client: fake.client, sys, db }, user.id, { spaceId: work, personId: kemi, transcript: "SECRET-CHAT-TEXT", me: "Ada", today: TODAY });
    expect(r.suggestions).toBe(5); // touch, promise, position (still empty), interests, next step
    const [{ n }] = await sql`select count(*)::int as n from suggestions where payload::text like '%SECRET-CHAT-TEXT%'`;
    expect(n).toBe(0);
  });

  it("drafts use the fast model", async () => {
    const fake = fakeAnthropic(() => ({ text: "Hi Kemi! How did the fund close go?" }));
    const r = await draftMessage({ client: fake.client, sys, db }, user.id, { personId: kemi, spaceId: work, purpose: "checkin" });
    expect(r.text).toBe("Hi Kemi! How did the fund close go?");
    expect(fake.calls[0].model).toBe("claude-haiku-5-5");
  });

  it("jobs record progress and a plain failure message", async () => {
    const jobId = await jobsStore(sys).create(user.id, "ai:research");
    const fake = fakeAnthropic(() => ({ text: "", stop: "refusal" }));
    await runAiJob(user.id, jobId, { kind: "research", personId: kemi, spaceId: work, mode: "research" }, { client: fake.client, sys, db });
    const [j] = await sql`select status, error from jobs where id = ${jobId}`;
    expect(j).toEqual({ status: "failed", error: expect.stringMatching(/declined/) });
  });
});
