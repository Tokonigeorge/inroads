import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayIn } from "@/domain/dates";
import { draftMessage, importChat, lookUp, researchPerson, scorePeople, writeBrief } from "@/server/ai/features";
import type { Tx } from "@/server/db/with-user";
import { runAiJob } from "@/server/jobs/ai-jobs";
import { createGoal } from "@/server/repos/goals";
import { createPerson, logTouch, saveMembership } from "@/server/repos/people";
import { createRoom, linkPerson } from "@/server/repos/rooms";
import { acceptSuggestion, discardSuggestion, pendingForPerson } from "@/server/repos/suggestions";
import { listSpaces } from "@/server/repos/spaces";
import { jobsStore } from "@/server/system/jobs";
import { fakeAnthropic, promptText, type FakeRequest } from "../fixtures/fake-anthropic";
import { connect, createUser } from "./helpers";

process.env.ANTHROPIC_API_KEY ??= "test-key";
// This file researches the same person more times than one day allows.
process.env.AI_LIMIT_RESEARCH ??= "50";
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
    expect(d).toMatchObject({ mode: "full", version: 1, confidence: "high", prompt_version: "research.full@2" });
    // The saved LinkedIn link is labelled; the shared guard goes in as the system prompt.
    expect(prompt).toContain("- LinkedIn: https://www.linkedin.com/in/kemi");
    expect(fake.calls[0].system).toMatch(/^You are the assistant inside Inroads/);
    const [{ payload }] = await sql`select payload from dossiers where id = ${r.dossierId}`;
    expect(payload).toMatchObject({ answeredFrom: "web", used: ["LinkedIn", "notes"] });
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

describe("research extras", () => {
  it("remembers pasted material and builds on the earlier research next time", async () => {
    const fake = fakeAnthropic(() => ({ json: { ...research, goalId } }));
    await researchPerson({ client: fake.client, sys, db }, user.id, { personId: kemi, spaceId: work, mode: "research", pasted: "PASTED-BIO: ex-Paystack" });
    const [m] = await sql`select source_notes from person_spaces where person_id = ${kemi} and space_id = ${work}`;
    expect(m.source_notes).toBe("PASTED-BIO: ex-Paystack");
    // Next run without pasting: the saved material is used, with what the last run found.
    await researchPerson({ client: fake.client, sys, db }, user.id, { personId: kemi, spaceId: work, mode: "research" });
    const prompt = promptText(fake.calls[1]);
    expect(prompt).toContain('MATERIAL I PASTED ABOUT THEM:\n"""\nPASTED-BIO: ex-Paystack');
    expect(prompt).toMatch(/Earlier research \(\d{4}-\d{2}-\d{2}, from the web\): Early-stage investor in Lagos\. \| Identity: Kemi Adebayo, partner at Kestrel \| Profiles found then: [^|]*https:\/\/x\.com\/kemi[^|]* \| Sources then: https:\/\/kestrel\.example\/team/);
    const [d] = await sql`select payload from dossiers where person_id = ${kemi} and space_id = ${work} order by version desc limit 1`;
    expect(d.payload.used).toContain("material you pasted");
  });

  it("falls back to knowledge only when the web tools are unavailable", async () => {
    const fake = fakeAnthropic((req) => {
      if (req.tools?.length) throw new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "web search is not enabled" } }, "web search is not enabled", new Headers());
      return { json: { ...research, goalId, sources: [] } };
    });
    const steps: string[] = [];
    const r = await researchPerson({ client: fake.client, sys, db }, user.id, { personId: kemi, spaceId: work, mode: "research" }, (s) => steps.push(s));
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1].tools).toBeUndefined();
    const prompt = promptText(fake.calls[1]);
    expect(prompt).toContain("NO WEB ACCESS in this run");
    expect(prompt).not.toContain("with web_fetch");
    expect(steps).toEqual([expect.stringMatching(/Web search isn't available/)]);
    const [d] = await sql`select payload, sources from dossiers where id = ${r.dossierId}`;
    expect(d.payload.answeredFrom).toBe("knowledge");
    expect(d.sources).toEqual([]);
    // Next time, the earlier research is marked as knowledge only.
    const again = fakeAnthropic(() => ({ json: { ...research, goalId } }));
    await researchPerson({ client: again.client, sys, db }, user.id, { personId: kemi, spaceId: work, mode: "research" });
    expect(promptText(again.calls[0])).toMatch(/Earlier research \(\d{4}-\d{2}-\d{2}, from model knowledge only\)/);
  });

  it("doesn't fall back on a rate limit", async () => {
    const fake = fakeAnthropic(() => {
      throw new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, "slow down", new Headers());
    });
    await expect(researchPerson({ client: fake.client, sys, db }, user.id, { personId: kemi, spaceId: work, mode: "research" })).rejects.toThrow("Inroads is busy right now. Try again in a minute.");
    expect(fake.calls).toHaveLength(1);
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

  it("look up recognises a saved person by name and links them", async () => {
    const fake = fakeAnthropic(() => ({ json: { title: "Kemi Adebayo", kind: "person", overview: "", facts: [], website: "", stakeholders: [], warmPaths: [], opportunities: [], playbook: [], confidence: "high", verify: "", sources: [] } }));
    const r = await lookUp({ client: fake.client, sys, db }, user.id, { spaceId: work, type: "person", q: "kemi adebayo" });
    const prompt = promptText(fake.calls[0]);
    expect(prompt).toContain("IN MY NETWORK: Kemi Adebayo\nName: Kemi Adebayo");
    expect(prompt).toContain("WORK-ONLY");
    expect(prompt).toContain("USE EVERYTHING I'VE SAVED");
    const [s] = await sql`select result, prompt_version from searches where id = ${r.searchId}`;
    expect(s.prompt_version).toBe("lookup@4");
    expect(s.result).toMatchObject({ personId: kemi, usedNames: ["Kemi Adebayo"], answeredFrom: "web" });
    expect(s.result.used).toContain("notes");
  });

  it("look up a place gives each person who works there in full, and finds warm paths in notes", async () => {
    const tola = randomUUID();
    await as((tx) => createPerson(tx, user.id, { id: tola, identity: { name: "Tola Ade", company: "Moonshot Labs" }, membership: { spaceId: work, notes: "Old friend" } }, TODAY));
    const femi = randomUUID();
    await as((tx) => createPerson(tx, user.id, { id: femi, identity: { name: "Femi Ojo" }, membership: { spaceId: work, notes: "Knows the Moonshot Labs founders" } }, TODAY));
    const fake = fakeAnthropic(() => ({ json: { title: "Moonshot Labs", kind: "company", overview: "", facts: [], website: "", stakeholders: [], warmPaths: [], opportunities: [], playbook: [], confidence: "medium", verify: "", sources: [] } }));
    const r = await lookUp({ client: fake.client, sys, db }, user.id, { spaceId: work, type: "place", q: "Moonshot Labs" });
    const prompt = promptText(fake.calls[0]);
    expect(prompt).toContain("IN MY NETWORK, WORKS THERE: Tola Ade\nName: Tola Ade");
    expect(prompt).toContain("My notes: Old friend");
    expect(prompt).toContain("the official site, the leadership team or who runs it, what they do or what happens there, recent news, who runs partnerships, and who goes");
    const [s] = await sql`select result from searches where id = ${r.searchId}`;
    expect(s.result.warmPaths).toEqual(
      expect.arrayContaining([
        { contactId: tola, how: "Works at Moonshot Labs", angle: "", name: "Tola Ade" },
        { contactId: femi, how: "Mentioned in your notes on them", angle: "", name: "Femi Ojo" },
      ]),
    );
  });

  it("look up an event finds the room on my list by title", async () => {
    const room = await as((tx) => createRoom(tx, user.id, { title: "Lagos Fintech Breakfast", kind: "meetup", startsOn: TODAY, startTime: "08:00", spaceId: work, location: "Ikoyi", notes: "ROOM-NOTE: bring cards", tz: "Africa/Lagos", freq: "weekly" }));
    if (!room.ok) throw new Error(room.message);
    await as((tx) => linkPerson(tx, user.id, room.data.id, kemi, "attendee"));
    const fake = fakeAnthropic(() => ({ json: { title: "Lagos Fintech Breakfast", kind: "event", overview: "", facts: [], website: "", stakeholders: [], warmPaths: [], opportunities: [], playbook: [], when: { startsOn: "", endsOn: "", startTime: "", endTime: "", timezone: "", venue: "", url: "" }, confidence: "medium", verify: "", sources: [] } }));
    const r = await lookUp({ client: fake.client, sys, db }, user.id, { spaceId: work, type: "event", q: "fintech breakfast" });
    const prompt = promptText(fake.calls[0]);
    expect(prompt).toContain("ON MY EVENTS LIST: Lagos Fintech Breakfast\nTitle: Lagos Fintech Breakfast\nType: Meetup\nRepeats: Every week");
    expect(prompt).toContain("My notes: ROOM-NOTE: bring cards");
    expect(prompt).toContain("People from my network linked to it: Kemi Adebayo");
    const [s] = await sql`select result from searches where id = ${r.searchId}`;
    expect(s.result.usedNames).toEqual(["Lagos Fintech Breakfast"]);
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

  it("the daily brief gives each person their research, labelled promises and interests, and news on companies only", async () => {
    const room = await as((tx) => createRoom(tx, user.id, { title: "Pricing review", kind: "meeting", startsOn: TODAY, startTime: "10:00", spaceId: work, tz: "Africa/Lagos", freq: "none" }));
    if (!room.ok) throw new Error(room.message);
    const indie = randomUUID();
    await as((tx) => createPerson(tx, user.id, { id: indie, identity: { name: "Bola Indie", company: "Independent", position: "Advisor" }, membership: { spaceId: work, interests: ["pricing"] } }, TODAY));
    await as((tx) => linkPerson(tx, user.id, room.data.id, kemi, "attendee"));
    await as((tx) => linkPerson(tx, user.id, room.data.id, indie, "attendee"));
    const fake = fakeAnthropic(() => ({ text: "## Today's rooms" }));
    await writeBrief({ client: fake.client, sys, db }, user.id, { spaceId: work, kind: "daily" });
    const prompt = promptText(fake.calls[0]);
    const agenda = JSON.parse(prompt.split("TODAY'S AGENDA (JSON):\n")[1].split("\n\nREMINDERS")[0]);
    const entry = agenda.find((a: { title: string }) => a.title === "Pricing review");
    const k = entry.people.find((p: { name: string }) => p.name === "Kemi Adebayo");
    expect(k).toMatchObject({ role: "Kestrel Ventures", dossier: "Early-stage investor in Lagos.", talkingPoints: ["Ask about their fintech thesis"] });
    expect(entry.people.find((p: { name: string }) => p.name === "Bola Indie")).toMatchObject({ role: "Advisor · Independent", interests: ["pricing"], openPromises: [] });
    // News on Kemi's company; "Independent" and job titles never become searches.
    expect(prompt).toContain("news from the last 30 days about: Kestrel Ventures.");
    expect(prompt).not.toMatch(/about: [^\n]*(Independent|Advisor)/);
    expect(fake.calls[0].tools?.map((t) => t.name)).toEqual(["web_search"]);
  });

  it("the weekly brief lists who's going cold, rooms with people and goal priority", async () => {
    const cold = randomUUID();
    await as((tx) => createPerson(tx, user.id, { id: cold, identity: { name: "Cold Starred" }, membership: { spaceId: work, starred: true, cadenceDays: 30 } }, TODAY));
    await as((tx) => logTouch(tx, user.id, { id: randomUUID(), personId: cold, spaceId: work, occurredOn: "2025-01-01", type: "call", summary: "COLD-TOUCH" }));
    const fake = fakeAnthropic(() => ({ text: "## This week's three moves" }));
    await writeBrief({ client: fake.client, sys, db }, user.id, { spaceId: work, kind: "weekly" });
    const prompt = promptText(fake.calls[0]);
    const coldJson = JSON.parse(prompt.split("GOING COLD (JSON): ")[1].split("\n")[0]);
    expect(coldJson).toEqual([expect.objectContaining({ name: "Cold Starred", lastInteraction: { date: "2025-01-01", summary: "COLD-TOUCH" }, score: null, daysSinceTouch: expect.any(Number) })]);
    expect(prompt).toContain('"goal":"Raise a pre-seed round","priority":"High","linked":1');
    expect(prompt).toMatch(/ROOMS THIS WEEK \(JSON\): .*"people":\[/);
    expect(prompt).not.toContain("DATING");
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

  it("scoring includes people from an import still waiting to be sorted, after the sorted ones", async () => {
    const fresh = randomUUID();
    await as((tx) => createPerson(tx, user.id, { id: fresh, identity: { name: "Fresh Import" }, membership: { spaceId: work } }, TODAY));
    await sql`update person_spaces set triage_state = 'pending' where person_id = ${fresh}`;
    const fake = fakeAnthropic(() => ({ json: { scores: [{ id: fresh, score: 40, why: "Unclear fit", goalId: "" }] } }));
    const r = await scorePeople({ client: fake.client, sys, db }, user.id, { spaceId: work });
    expect(r.scored).toBe(1);
    const rows = promptText(fake.calls[0]).split("\n").filter((l) => /^[0-9a-f-]{36} \|/.test(l));
    expect(rows.at(-1)).toContain("Fresh Import");
  });

  it("chat import suggests touches and promises, and stores no transcript", async () => {
    const fake = fakeAnthropic(() => ({ json: { summary: "Warm", lastDate: TODAY, interactions: [{ date: TODAY, summary: "Agreed to meet" }], commitments: [{ text: "Send the deck", owner: "me", due: "" }], details: { company: "", position: "Partner", interests: ["fintech"], birthday: "" }, sentiment: "warm", nextStep: "Book a coffee" } }));
    const r = await importChat({ client: fake.client, sys, db }, user.id, { spaceId: work, personId: kemi, transcript: "SECRET-CHAT-TEXT", me: "Ada", today: TODAY });
    expect(r.suggestions).toBe(6); // touch, promise, position (still empty), interests, the "From chat" note, next step
    const [{ n }] = await sql`select count(*)::int as n from suggestions where payload::text like '%SECRET-CHAT-TEXT%'`;
    expect(n).toBe(0);
  });

  it("chat import: undated moments land on the last message's date, the summary becomes a note, family its own", async () => {
    const fake = fakeAnthropic(() => ({ json: { summary: "Agreed to meet in Accra.", lastDate: "2026-10-01", interactions: [{ date: "", summary: "Talked about Accra" }], commitments: [], details: { company: "", position: "", interests: [], birthday: "", other: ["Moving to Accra in January"], family: "Two daughters, Ada and Tobi" }, sentiment: "warm", nextStep: "" } }));
    await importChat({ client: fake.client, sys, db }, user.id, { spaceId: work, personId: kemi, transcript: "x", me: "Ada", today: "2026-10-26" });
    expect(fake.calls[0].output_config?.format).toBeTruthy();
    const s = await as((tx) => pendingForPerson(tx, kemi));
    const touch = s.find((x) => x.kind === "interaction" && (x.payload as { summary: string }).summary === "Talked about Accra");
    expect((touch?.payload as { occurredOn: string }).occurredOn).toBe("2026-10-01");
    const note = s.find((x) => x.kind === "note" && (x.payload as { text: string }).text.startsWith("From chat"));
    expect((note?.payload as { text: string }).text).toBe("From chat (26 Oct 2026): Agreed to meet in Accra.\nMoving to Accra in January");
    const family = s.find((x) => x.kind === "note" && (x.payload as { text: string }).text.startsWith("Family:"));
    expect((family?.payload as { text: string }).text).toBe("Family: Two daughters, Ada and Tobi");
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
    expect(j).toEqual({ status: "failed", error: "Inroads couldn't do this one. Try rewording it or adding more context." });
  });
});
