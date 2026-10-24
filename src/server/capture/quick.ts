import "server-only";
import { and, asc, eq, ilike, isNull, sql } from "drizzle-orm";
import { quickDraftSchema, type QuickCandidate, type QuickReadResult } from "@/contracts/quick-capture";
import { isIsoDate, weekday, type IsoDate } from "@/domain/dates";
import { parseQuickCapture, type QuickDraft } from "@/domain/quick-capture";
import { isAiConfigured } from "@/server/ai/config";
import type { FeatureDeps } from "@/server/ai/features";
import { AiLimitError } from "@/server/ai/limits";
import { capturePrompt, captureSchema } from "@/server/ai/prompts/capture";
import { AiError, runAI } from "@/server/ai/run";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const iso = (s: string) => (isIsoDate(s.trim()) ? s.trim() : null);
const text = (s: string) => s.trim() || null;

/** Reads the line with the fast model, keeping only dates that make sense. */
async function readWithAi(deps: FeatureDeps, userId: string, line: string, today: IsoDate): Promise<QuickDraft> {
  const r = await runAI(
    {
      userId,
      feature: "capture",
      tier: "fast",
      schema: captureSchema,
      maxTokens: 800,
      prompt: capturePrompt({ line, today, weekday: WEEKDAYS[weekday(today)] }),
    },
    deps,
  );
  const o = r.output;
  const touchedOn = iso(o.touchDate);
  return {
    name: text(o.name),
    company: text(o.company),
    position: text(o.position),
    touch:
      o.touched && text(o.name)
        ? {
            type: o.touchType,
            occurredOn: touchedOn && touchedOn <= today ? touchedOn : today,
            summary: line,
          }
        : null,
    promises: o.promises
      .filter((p) => p.text.trim())
      .slice(0, 5)
      .map((p) => ({ text: p.text.trim(), owner: p.owner, dueOn: iso(p.due) })),
    followUpOn: iso(o.followUpDate),
  };
}

/** People in this Space whose name matches, best first. Never merges: the user picks. */
export async function nameCandidates(tx: Tx, spaceId: string, name: string | null): Promise<QuickCandidate[]> {
  const term = name?.trim();
  if (!term) return [];
  const first = term.split(/\s+/)[0].replace(/[\\%_]/g, (m) => `\\${m}`);
  const rows = await tx
    .select({
      id: t.people.id,
      name: t.people.name,
      company: t.people.company,
      position: t.people.position,
    })
    .from(t.people)
    .innerJoin(t.personSpaces, and(eq(t.personSpaces.personId, t.people.id), eq(t.personSpaces.spaceId, spaceId)))
    .where(and(isNull(t.people.deletedAt), isNull(t.personSpaces.archivedAt), ilike(t.people.name, `%${first}%`)))
    .orderBy(sql`case when lower(people.name) = lower(${term}) then 0 when people.name ilike ${`${first}%`} then 1 else 2 end`, asc(t.people.name))
    .limit(5);
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    detail: [p.position, p.company].filter(Boolean).join(" at "),
  }));
}

/**
 * Turns one line into a draft to review. Uses the fast model when AI is set up and under its
 * limit, and the rules parser otherwise (or if the model fails), so capture always works.
 */
export async function readQuickCapture(tx: Tx, deps: FeatureDeps, userId: string, input: { line: string; spaceId: string; today: IsoDate }): Promise<QuickReadResult> {
  let draft = parseQuickCapture(input.line, input.today);
  let source: QuickReadResult["source"] = "rules";
  if (deps.client || isAiConfigured()) {
    try {
      draft = await readWithAi(deps, userId, input.line, input.today);
      source = "ai";
    } catch (e) {
      if (!(e instanceof AiError) && !(e instanceof AiLimitError)) console.error("quick capture AI failed", e);
    }
  }
  const parsed = quickDraftSchema.parse(draft);
  return {
    draft: parsed,
    source,
    candidates: await nameCandidates(tx, input.spaceId, parsed.name),
  };
}
