/**
 * Research and look-up eval: would Sonnet research people and look up companies and events as
 * well as Opus, at about half the price? These two (with suggested rooms) are where the AI money
 * goes; briefs cost cents.
 *
 *   pnpm eval:research --email you@example.com --dry   the cases and the estimate, spends nothing
 *   pnpm eval:research --email you@example.com         runs them, stops before $5
 *   options: --people 4  --lookups 2  --budget 5  --candidate claude-sonnet-5-5
 *
 * Cases come from your own account, read only: the people you've researched most recently, and
 * your most recent look-ups of a company, person or event. Each request is built by the app's own
 * code in capture mode (nothing is sent from the app, nothing is saved), then sent to the current
 * model and the candidate, both with web search. The current model grades each pair blind (order
 * shuffled) on identity, accuracy, usefulness and coverage. Calls made here aren't counted against
 * the app's limits. Results go to eval-results/ (git-ignored): read a few pairs before deciding.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
// The captured requests go through the app's limit check; the eval's own spend is capped below.
for (const f of ["RESEARCH", "LOOKUP"]) process.env[`AI_LIMIT_${f}`] = "1000";
process.env.AI_USER_MONTHLY_USD = "1000";

import { mkdirSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessageParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { aiConfig, estimateCostMicroUsd } from "../src/server/ai/config";
import { lookUp, researchPerson } from "../src/server/ai/features";
import { extractJson } from "../src/server/ai/json";
import type { LookupType } from "../src/server/ai/prompts/lookup";
import { INROADS_SYSTEM } from "../src/server/ai/prompts/shared";
import { CapturedRequest } from "../src/server/ai/run";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BUDGET_USD = Number(arg("budget", "5"));
const PEOPLE = Number(arg("people", "4"));
const LOOKUPS = Number(arg("lookups", "2"));
const EMAIL = arg("email", "");
const BASELINE = aiConfig().models.strong;
const CANDIDATE = arg("candidate", "claude-sonnet-5-5");
const DRY = process.argv.includes("--dry");

/** Upper bounds per call, from the app's own usage log (web pages make the input large). */
const GUESS_USD: Record<string, number> = {
  [BASELINE]: 1.1,
  [CANDIDATE]: 0.6,
  judge: 0.12,
};

type Case = {
  id: string;
  kind: "research" | "lookup";
  label: string;
  params: MessageCreateParamsNonStreaming;
};
type Scores = {
  identity: number;
  accuracy: number;
  usefulness: number;
  coverage: number;
};
const KEYS = ["identity", "accuracy", "usefulness", "coverage"] as const;

const client = new Anthropic({ maxRetries: 2 });
let spentMicro = 0;
const spent = () => spentMicro / 1_000_000;

/** One answer, resuming paused web turns like the app does. */
async function answer(
  params: MessageCreateParamsNonStreaming,
  guessKey: string,
) {
  if (spent() + GUESS_USD[guessKey] > BUDGET_USD) throw new Error("budget");
  const messages: BetaMessageParam[] = [...params.messages];
  let text = "";
  let searches = 0;
  for (let turn = 0; turn < 4; turn++) {
    const msg = await client.beta.messages.create({ ...params, messages });
    const u = msg.usage;
    const s = u.server_tool_use?.web_search_requests ?? 0;
    searches += s;
    spentMicro += estimateCostMicroUsd(msg.model || params.model, {
      input: u.input_tokens,
      output: u.output_tokens,
      searches: s,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    });
    text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({
      role: "assistant",
      content: msg.content as BetaContentBlockParam[],
    });
  }
  return { text, json: extractJson(text), searches };
}

async function yourCases(): Promise<Case[]> {
  const { getSystemDb } = await import("../src/server/db/client");
  const { sql } = await import("drizzle-orm");
  const sys = getSystemDb();
  const [u] = [
    ...(await sys.execute<{ id: string }>(
      sql`select id from auth.users where email = ${EMAIL}`,
    )),
  ];
  if (!u) throw new Error(`No account for ${EMAIL}.`);
  const people = [
    ...(await sys.execute<{
      person_id: string;
      space_id: string;
      name: string;
    }>(sql`
      select distinct on (d.person_id) d.person_id, d.space_id, p.name
        from dossiers d join people p on p.id = d.person_id and p.deleted_at is null
       where d.user_id = ${u.id} and d.mode = 'full'
       order by d.person_id, d.created_at desc`)),
  ].slice(0, PEOPLE);
  const looks = [
    ...(await sys.execute<{
      space_id: string;
      type: LookupType;
      query: string;
      event_id: string | null;
    }>(sql`
      select distinct on (lower(query)) space_id, type, query, event_id
        from searches
       where user_id = ${u.id} and type in ('person', 'company', 'event', 'place')
       order by lower(query), created_at desc`)),
  ].slice(0, LOOKUPS);
  const out: Case[] = [];
  const capture = async (
    id: string,
    kind: Case["kind"],
    label: string,
    run: () => Promise<unknown>,
  ) => {
    try {
      await run();
      console.warn(`skipped ${label}: nothing to capture`);
    } catch (e) {
      if (e instanceof CapturedRequest)
        out.push({ id, kind, label, params: e.params });
      else console.warn(`skipped ${label}: ${(e as Error).message}`);
    }
  };
  for (const [i, p] of people.entries()) {
    await capture(`research-${i + 1}`, "research", `Research: ${p.name}`, () =>
      researchPerson({ capture: true }, u.id, {
        personId: p.person_id,
        spaceId: p.space_id,
        mode: "research",
      }),
    );
  }
  for (const [i, l] of looks.entries()) {
    await capture(
      `lookup-${i + 1}`,
      "lookup",
      `Look up (${l.type}): ${l.query}`,
      () =>
        lookUp({ capture: true }, u.id, {
          spaceId: l.space_id,
          type: l.type,
          q: l.query,
          ...(l.event_id ? { eventId: l.event_id } : {}),
        }),
    );
  }
  return out;
}

async function judge(c: Case, a: string, b: string) {
  const request = JSON.stringify(c.params.messages).slice(0, 12000);
  const prompt = `Two assistants answered the same ${c.kind === "research" ? "person-research" : "look-up"} request using web search. Grade them against the request and what each says it found.

THE REQUEST (with what the user already has saved):
${request}

ANSWER A:
${a.slice(0, 14000)}

ANSWER B:
${b.slice(0, 14000)}

Score each 1–5 on:
- identity: is it clearly about the right ${c.kind === "research" ? "person (matches the saved details, not a namesake)" : "organisation, person or event"}, and does it say how sure it is?
- accuracy: claims are specific and tied to sources; nothing looks invented; uncertainty is admitted. Score 1 if anything looks made up.
- usefulness: talking points, openings and next steps are concrete and tied to the user's goals.
- coverage: it found the role, organisation, profiles and recent signals a careful researcher would.
Reply with JSON only: {"a":{"identity":n,"accuracy":n,"usefulness":n,"coverage":n},"b":{...},"preferred":"A"|"B"|"tie","why":"one or two sentences, naming any error you saw"}`;
  const r = await answer(
    {
      model: BASELINE,
      max_tokens: 1500,
      system: INROADS_SYSTEM,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort: "low" },
    } as MessageCreateParamsNonStreaming,
    "judge",
  );
  return r.json as {
    a: Scores;
    b: Scores;
    preferred: "A" | "B" | "tie";
    why: string;
  };
}

async function main() {
  if (!EMAIL) throw new Error("Pass --email with your sign-in email.");
  if (!DRY && !process.env.ANTHROPIC_API_KEY)
    throw new Error("ANTHROPIC_API_KEY is not set.");
  const cases = await yourCases();
  const perCase = GUESS_USD[BASELINE] + GUESS_USD[CANDIDATE] + GUESS_USD.judge;
  console.log(
    `${cases.length} cases. ${BASELINE} vs ${CANDIDATE}, budget $${BUDGET_USD}.`,
  );
  for (const c of cases) console.log(`  ${c.id}  ${c.label}`);
  console.log(
    `At most about $${(cases.length * perCase).toFixed(2)} (usually much less); the run stops before $${BUDGET_USD}.`,
  );
  if (DRY) process.exit(0);

  const rows: {
    id: string;
    label: string;
    baseline: string;
    candidate: string;
    searches: { baseline: number; candidate: number };
    scores: {
      baseline: Scores;
      candidate: Scores;
      preferred: string;
      why: string;
    };
  }[] = [];
  try {
    for (const c of cases) {
      const base = await answer({ ...c.params, model: BASELINE }, BASELINE);
      const cand = await answer({ ...c.params, model: CANDIDATE }, CANDIDATE);
      const flip = Math.random() < 0.5;
      const j = await judge(
        c,
        flip ? cand.text : base.text,
        flip ? base.text : cand.text,
      );
      const [sb, sc] = flip ? [j.b, j.a] : [j.a, j.b];
      const preferred =
        j.preferred === "tie"
          ? "tie"
          : (j.preferred === "A") !== flip
            ? "baseline"
            : "candidate";
      rows.push({
        id: c.id,
        label: c.label,
        baseline: base.text,
        candidate: cand.text,
        searches: { baseline: base.searches, candidate: cand.searches },
        scores: { baseline: sb, candidate: sc, preferred, why: j.why },
      });
      console.log(
        `${c.label.slice(0, 44).padEnd(46)} prefers ${preferred.padEnd(9)} spent $${spent().toFixed(2)}`,
      );
    }
  } catch (e) {
    if ((e as Error).message !== "budget") throw e;
    console.log(`Stopped before going over $${BUDGET_USD}.`);
  }

  const avg = (k: keyof Scores, who: "baseline" | "candidate") =>
    rows.reduce((s, r) => s + (r.scores[who][k] ?? 0), 0) /
    Math.max(1, rows.length);
  const wins = (w: string) =>
    rows.filter((r) => r.scores.preferred === w).length;
  const report = [
    `# Research and look-up eval: ${BASELINE} vs ${CANDIDATE}`,
    "",
    `${rows.length} cases, $${spent().toFixed(2)} spent.`,
    "",
    `| | ${BASELINE} | ${CANDIDATE} |`,
    "|---|---|---|",
    ...KEYS.map(
      (k) =>
        `| ${k} (1–5) | ${avg(k, "baseline").toFixed(2)} | ${avg(k, "candidate").toFixed(2)} |`,
    ),
    `| web searches (total) | ${rows.reduce((s, r) => s + r.searches.baseline, 0)} | ${rows.reduce((s, r) => s + r.searches.candidate, 0)} |`,
    `| preferred by the grader | ${wins("baseline")} | ${wins("candidate")} |`,
    "",
    `Ties: ${wins("tie")}.`,
    "",
    ...rows.map(
      (r) => `- **${r.label}**: prefers ${r.scores.preferred}. ${r.scores.why}`,
    ),
    "",
    "Read a few pairs in pairs.json before deciding: the grader is a model too, and only you know who these people really are.",
  ].join("\n");
  const dir = `eval-results/research-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/report.md`, report);
  writeFileSync(`${dir}/pairs.json`, JSON.stringify(rows, null, 2));
  console.log(`\n${report}\n\nSaved to ${dir}/`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
