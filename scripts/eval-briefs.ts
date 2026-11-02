/**
 * Brief eval: would a cheaper model write daily and weekly briefs as well as today's?
 *
 *   pnpm eval:briefs --email you@example.com            your Spaces + 12 made-up accounts
 *   pnpm eval:briefs --cases 20 --budget 5              made-up only, up to $5
 *   pnpm eval:briefs --dry                               list the cases and the estimated cost, spend nothing
 *   options: --candidate claude-sonnet-5-5  --budget 5  --cases 12  --email <you>
 *
 * Needs ANTHROPIC_API_KEY, and DATABASE_URL for --email (read only: your briefs are built in
 * capture mode, nothing is sent from the app or saved). Each prompt goes to the current model and
 * the candidate; the current model then grades each pair blind (order shuffled) on coverage,
 * accuracy, usefulness and brevity. A plain check also counts which meetings and names each brief
 * mentions. Spend is tracked as it goes and the run stops before the budget. Results are written
 * to eval-results/ (git-ignored: it contains your briefs).
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

import { mkdirSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { aiConfig, estimateCostMicroUsd } from "../src/server/ai/config";
import { writeBrief } from "../src/server/ai/features";
import { extractJson } from "../src/server/ai/json";
import {
  dailyBriefPrompt,
  weeklyBriefPrompt,
} from "../src/server/ai/prompts/writing";
import { INROADS_SYSTEM } from "../src/server/ai/prompts/shared";
import { CapturedRequest } from "../src/server/ai/run";
import { SYNTHETIC_ME, syntheticCases } from "./eval/synthetic";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BUDGET_USD = Number(arg("budget", "5"));
const CASES = Number(arg("cases", "12"));
const EMAIL = arg("email");
const BASELINE = aiConfig().models.strong;
const CANDIDATE = arg("candidate", "claude-sonnet-5-5")!;

type Case = {
  id: string;
  source: "you" | "made-up";
  params: MessageCreateParamsNonStreaming;
  mustMention: string[];
};
type Scores = {
  coverage: number;
  accuracy: number;
  usefulness: number;
  brevity: number;
};

const client = new Anthropic({ maxRetries: 2 });
let spentMicro = 0;
const spent = () => spentMicro / 1_000_000;

/** Rough upper bound for one call, so the run stops before going over. */
const guess = (chars: number, model: string) =>
  estimateCostMicroUsd(model, {
    input: Math.ceil(chars / 3),
    output: 900,
    searches: 2,
  }) / 1_000_000;

async function call(params: MessageCreateParamsNonStreaming) {
  const chars = JSON.stringify(params.messages).length;
  if (spent() + guess(chars, params.model) > BUDGET_USD)
    throw new Error("budget");
  const msg = await client.beta.messages.create(params);
  const u = msg.usage;
  spentMicro += estimateCostMicroUsd(msg.model || params.model, {
    input: u.input_tokens,
    output: u.output_tokens,
    searches: u.server_tool_use?.web_search_requests ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  });
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
}

async function yourCases(): Promise<Case[]> {
  if (!EMAIL) return [];
  const { getSystemDb } = await import("../src/server/db/client");
  const { sql } = await import("drizzle-orm");
  const sys = getSystemDb();
  const [u] = [
    ...(await sys.execute<{ id: string }>(
      sql`select id from auth.users where email = ${EMAIL}`,
    )),
  ];
  if (!u) throw new Error(`No account for ${EMAIL}.`);
  const spaces = [
    ...(await sys.execute<{ id: string; name: string }>(
      sql`select id, name from spaces where user_id = ${u.id} and archived_at is null order by position`,
    )),
  ];
  const out: Case[] = [];
  for (const s of spaces) {
    for (const kind of ["daily", "weekly"] as const) {
      try {
        await writeBrief({ capture: true }, u.id, { spaceId: s.id, kind });
      } catch (e) {
        if (!(e instanceof CapturedRequest)) {
          console.warn(`skipped ${s.name} ${kind}: ${(e as Error).message}`);
          continue;
        }
        const text = JSON.stringify(e.params.messages);
        // Names and titles in the brief's data are what it should mention.
        const mustMention = [
          ...new Set(
            [
              ...text.matchAll(/\\"(?:title|name)\\":\\"([^"\\]{2,60})\\"/g),
            ].map((m) => m[1]),
          ),
        ]
          // Short names and titles only: a reminder's whole sentence won't appear word for word.
          .filter((x) => x.length <= 40)
          .slice(0, 10);
        // A Space with nothing on (no meetings, reminders or names) says nothing about the models.
        if (!mustMention.length) continue;
        out.push({
          id: `you-${s.name.toLowerCase()}-${kind}`,
          source: "you",
          params: { ...e.params, max_tokens: 4000 },
          mustMention,
        });
      }
    }
  }
  return out;
}

function madeUpCases(): Case[] {
  return syntheticCases(CASES).map((c) => {
    const prompt =
      c.kind === "daily"
        ? dailyBriefPrompt({
            date: "Tuesday 3 November",
            me: SYNTHETIC_ME,
            agenda: c.input.agenda,
            nudges: c.input.nudges,
            news: [],
          })
        : weeklyBriefPrompt({
            from: "Monday 2 November",
            to: "Sunday 8 November",
            me: SYNTHETIC_ME,
            rooms: c.input.rooms,
            cold: c.input.cold,
            goals: c.input.goals,
            openings: [],
            nudges: [],
          });
    return {
      id: c.id,
      source: "made-up",
      mustMention: c.mustMention,
      params: {
        model: BASELINE,
        max_tokens: 4000,
        system: INROADS_SYSTEM,
        messages: [{ role: "user", content: prompt }],
        output_config: { effort: "medium" },
      } as MessageCreateParamsNonStreaming,
    };
  });
}

const coverage = (brief: string, must: string[]) =>
  must.length
    ? must.filter((m) => brief.toLowerCase().includes(m.toLowerCase())).length /
      must.length
    : 1;

async function judge(c: Case, a: string, b: string) {
  const input = JSON.stringify(c.params.messages).slice(0, 14000);
  const prompt = `You are grading two networking briefs written from the same data. Judge only against the data; never reward invented facts.

THE REQUEST AND DATA:
${input}

BRIEF A:
${a}

BRIEF B:
${b}

Score each brief 1–5 on: coverage (mentions the meetings, people, promises and reminders that matter), accuracy (nothing invented or wrong; 1 if anything is made up), usefulness (clear, specific next steps, not filler), brevity (within the word limit, no padding).
Reply with JSON only: {"a":{"coverage":n,"accuracy":n,"usefulness":n,"brevity":n},"b":{...},"preferred":"A"|"B"|"tie","why":"one sentence"}`;
  const text = await call({
    model: BASELINE,
    max_tokens: 1500,
    system: INROADS_SYSTEM,
    messages: [{ role: "user", content: prompt }],
    output_config: { effort: "low" },
  } as MessageCreateParamsNonStreaming);
  return extractJson(text) as {
    a: Scores;
    b: Scores;
    preferred: "A" | "B" | "tie";
    why: string;
  };
}

async function main() {
  const dry = process.argv.includes("--dry");
  if (!dry && !process.env.ANTHROPIC_API_KEY)
    throw new Error("ANTHROPIC_API_KEY is not set.");
  const cases = [...(await yourCases()), ...madeUpCases()];
  console.log(
    `${cases.length} cases (${cases.filter((c) => c.source === "you").length} from your account). ${BASELINE} vs ${CANDIDATE}, budget $${BUDGET_USD}.`,
  );
  if (dry) {
    // Two briefs and one grading per case, each priced at its upper bound.
    const est = cases.reduce((sum, c) => {
      const chars = JSON.stringify(c.params.messages).length;
      return (
        sum +
        guess(chars, BASELINE) +
        guess(chars, CANDIDATE) +
        guess(chars + 6000, BASELINE)
      );
    }, 0);
    for (const c of cases)
      console.log(
        `  ${c.id}  must mention: ${c.mustMention.join(", ") || "-"}`,
      );
    console.log(
      `At most about $${est.toFixed(2)} for all of them (the run stops at $${BUDGET_USD}).`,
    );
    process.exit(0);
  }
  const rows: {
    id: string;
    source: string;
    baseline: string;
    candidate: string;
    scores?: {
      baseline: Scores;
      candidate: Scores;
      preferred: string;
      why: string;
    };
    coverage: { baseline: number; candidate: number };
  }[] = [];
  try {
    for (const c of cases) {
      const baseline = await call({ ...c.params, model: BASELINE });
      const candidate = await call({ ...c.params, model: CANDIDATE });
      // Blind: a coin flip decides which brief is A.
      const flip = Math.random() < 0.5;
      const j = await judge(
        c,
        flip ? candidate : baseline,
        flip ? baseline : candidate,
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
        source: c.source,
        baseline,
        candidate,
        scores: { baseline: sb, candidate: sc, preferred, why: j.why },
        coverage: {
          baseline: coverage(baseline, c.mustMention),
          candidate: coverage(candidate, c.mustMention),
        },
      });
      console.log(
        `${c.id.padEnd(28)} prefers ${preferred.padEnd(9)} spent $${spent().toFixed(2)}`,
      );
    }
  } catch (e) {
    if ((e as Error).message !== "budget") throw e;
    console.log(`Stopped before going over $${BUDGET_USD}.`);
  }

  const avg = (k: keyof Scores, who: "baseline" | "candidate") =>
    rows.reduce((s, r) => s + (r.scores?.[who][k] ?? 0), 0) /
    Math.max(1, rows.length);
  const cov = (who: "baseline" | "candidate") =>
    rows.reduce((s, r) => s + r.coverage[who], 0) / Math.max(1, rows.length);
  const wins = (w: string) =>
    rows.filter((r) => r.scores?.preferred === w).length;
  const report = [
    `# Brief eval: ${BASELINE} vs ${CANDIDATE}`,
    "",
    `${rows.length} cases, $${spent().toFixed(2)} spent.`,
    "",
    "| | " + BASELINE + " | " + CANDIDATE + " |",
    "|---|---|---|",
    ...(["coverage", "accuracy", "usefulness", "brevity"] as const).map(
      (k) =>
        `| ${k} (1–5) | ${avg(k, "baseline").toFixed(2)} | ${avg(k, "candidate").toFixed(2)} |`,
    ),
    `| names and meetings mentioned | ${(cov("baseline") * 100).toFixed(0)}% | ${(cov("candidate") * 100).toFixed(0)}% |`,
    `| preferred by the grader | ${wins("baseline")} | ${wins("candidate")} |`,
    "",
    `Ties: ${wins("tie")}. Read a few pairs in pairs.json before deciding: the grader is a model too.`,
  ].join("\n");
  const dir = `eval-results/briefs-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
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
