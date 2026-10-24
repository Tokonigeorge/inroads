import "server-only";
import { sql } from "drizzle-orm";
import { matchReason, questionTerms } from "@/domain/ask";
import { isAiConfigured } from "@/server/ai/config";
import type { FeatureDeps } from "@/server/ai/features";
import { AiLimitError } from "@/server/ai/limits";
import { askRankPrompt, askRankSchema, askTermsPrompt, askTermsSchema } from "@/server/ai/prompts/ask";
import { AiError, runAI } from "@/server/ai/run";
import type { Tx } from "@/server/db/with-user";

export type AskMatch = { id: string; name: string; detail: string; why: string };
export type AskResult = { matches: AskMatch[]; source: "ai" | "words"; terms: string[] };

type Candidate = {
  id: string;
  name: string;
  position: string | null;
  company: string | null;
  city: string | null;
  where_met: string | null;
  interests: string[];
  tags: string[];
  notes: string | null;
  opportunities: string | null;
  research: string | null;
  touches: string | null;
  hits: number;
  found: string[];
};

const clip = (s: string | null, n: number) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * People in one Space whose details mention the terms: identity, your notes and tags for that
 * Space, the latest research there and recent touch summaries. Best hits first.
 */
export async function findCandidates(tx: Tx, spaceId: string, terms: string[], limit = 30): Promise<Candidate[]> {
  if (!terms.length) return [];
  const rows = await tx.execute<Candidate>(sql`
    with base as (
      select p.id, p.name, p.position, p.company, p.city, ps.where_met, ps.interests, ps.tags, ps.notes, ps.opportunities,
        (select concat_ws(' ', d.payload ->> 'summary', d.payload ->> 'company', d.payload -> 'career', d.payload -> 'signals', d.payload -> 'sharedInterests', d.payload -> 'starters')
           from dossiers d where d.person_id = p.id and d.space_id = ${spaceId} order by d.version desc limit 1) as research,
        (select string_agg(i.summary, ' · ' order by i.occurred_on desc) from (select summary, occurred_on from interactions where person_id = p.id and space_id = ${spaceId} and summary is not null order by occurred_on desc limit 5) i) as touches
      from people p
      join person_spaces ps on ps.person_id = p.id and ps.space_id = ${spaceId} and ps.archived_at is null
      where p.deleted_at is null
    ), blob as (
      select *, lower(concat_ws(' ', name, position, company, city, where_met, array_to_string(interests, ' '), array_to_string(tags, ' '), notes, opportunities, research, touches)) as text from base
    )
    select id, name, position, company, city, where_met, interests, tags, notes, opportunities, research, touches,
      found, cardinality(found) as hits
    from (select blob.*, array(select t from json_array_elements_text(${JSON.stringify(terms)}::json) with ordinality as u(t, n) where strpos(blob.text, lower(t)) > 0 order by n) as found from blob) scored
    where cardinality(found) > 0
    order by cardinality(found) desc, name
    limit ${limit}`);
  return [...rows];
}

const detailOf = (c: Pick<Candidate, "position" | "company">) => [c.position, c.company].filter(Boolean).join(" at ");

/**
 * "Who do I know in fintech in Accra who's raised before?" Searches one Space only. With AI, the
 * fast model widens the terms and ranks the candidates with a reason citing what you recorded;
 * without it (or past the limit), the best word matches come back with the words they matched.
 */
export async function askNetwork(tx: Tx, deps: FeatureDeps, userId: string, input: { spaceId: string; question: string }): Promise<AskResult> {
  const question = input.question.trim().slice(0, 300);
  const base = questionTerms(question);
  const ai = Boolean(deps.client) || isAiConfigured();
  if (ai) {
    try {
      const plan = await runAI({ userId, feature: "ask", tier: "fast", schema: askTermsSchema, maxTokens: 300, prompt: askTermsPrompt(question) }, deps);
      const terms = [...new Set([...base, ...plan.output.terms.map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 2)])].slice(0, 16);
      const candidates = await findCandidates(tx, input.spaceId, terms);
      if (!candidates.length) return { matches: [], source: "ai", terms };
      const compact = candidates.map((c) => ({
        id: c.id,
        name: c.name,
        role: detailOf(c) || undefined,
        city: c.city ?? undefined,
        whereMet: c.where_met ?? undefined,
        interests: c.interests.length ? c.interests : undefined,
        tags: c.tags.length ? c.tags : undefined,
        notes: clip(c.notes, 400) ?? undefined,
        opportunities: clip(c.opportunities, 200) ?? undefined,
        research: clip(c.research, 500) ?? undefined,
        recentTouches: clip(c.touches, 300) ?? undefined,
      }));
      const ranked = await runAI({ userId, feature: "ask", tier: "fast", schema: askRankSchema, maxTokens: 1200, skipLimit: true, prompt: askRankPrompt({ question, candidates: compact }) }, deps);
      const byId = new Map(candidates.map((c) => [c.id, c]));
      const seen = new Set<string>();
      const matches = ranked.output.matches
        .filter((m) => byId.has(m.id) && !seen.has(m.id) && seen.add(m.id))
        .slice(0, 8)
        .map((m) => {
          const c = byId.get(m.id)!;
          return { id: c.id, name: c.name, detail: detailOf(c), why: m.why.trim().slice(0, 240) || matchReason(c.found) };
        });
      return { matches, source: "ai", terms };
    } catch (e) {
      if (!(e instanceof AiError) && !(e instanceof AiLimitError)) throw e;
    }
  }
  const candidates = await findCandidates(tx, input.spaceId, base, 8);
  return { matches: candidates.map((c) => ({ id: c.id, name: c.name, detail: detailOf(c), why: matchReason(c.found) })), source: "words", terms: base };
}
