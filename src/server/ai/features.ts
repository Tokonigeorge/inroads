import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { goalPriorityLabels } from "@/contracts/goals";
import { addDays, formatLongDate, type IsoDate } from "@/domain/dates";
import { weekOf } from "@/domain/goal-progress";
import { normalisePhone } from "@/domain/normalise";
import { recurrenceLabel } from "@/domain/recurrence";
import { warmth } from "@/domain/relationship";
import { isValidTimeZone } from "@/domain/zoned";
import { db as appDb } from "@/server/db/client";
import * as t from "@/server/db/schema";
import type { Database, Tx } from "@/server/db/with-user";
import { listGoals } from "@/server/repos/goals";
import { listNudges, todayAgenda } from "@/server/repos/nudges";
import { personRollup } from "@/server/repos/people";
import { listUpcoming, recurrenceOf } from "@/server/repos/rooms";
import { createSuggestions, type NewSuggestion } from "@/server/repos/suggestions";
import { userContext } from "@/server/user-context";
import type { AnthropicLike } from "./client";
import { briefPerson, cell, eventBlock, identityRules, loadMe, meBlock, personBlock, profileUsed, webRules } from "./context/blocks";
import { localPaths, matchCompany, matchEvents, matchPeople } from "./context/known";
import { loadNetworkDigest, loadPersonContext, loadSpaceContext, type PersonContext } from "./context/space-context";
import { lookupPrompt, lookupSchema, LOOKUP_VERSION, lookupWhat, type Lookup, type LookupType } from "./prompts/lookup";
import { homeCity, radarPrompt, radarSchema, RADAR_VERSION } from "./prompts/radar";
import { getToKnowPrompt, getToKnowSchema, GET_TO_KNOW_VERSION, researchFullPrompt, researchFullSchema, RESEARCH_FULL_VERSION, verifyPrompt, verifySchema, VERIFY_VERSION } from "./prompts/research";
import {
  BRIEF_VERSION,
  cardPrompt,
  cardSchema,
  chatPrompt,
  chatSchema,
  dailyBriefPrompt,
  draftPrompt,
  scorePrompt,
  scoreSchema,
  weeklyBriefPrompt,
  type DraftPurpose,
} from "./prompts/writing";
import { shortDate } from "./prompts/shared";
import { AiError, runAI, runWithWebFallback } from "./run";
import { mergeSources, type Source } from "./sources";

export type FeatureDeps = { db?: Pick<typeof appDb, "withUser">; sys?: Database; client?: AnthropicLike };
type Progress = (step: string) => void;
const noop: Progress = () => {};

const isHttp = (u: string) => /^https?:\/\/\S+$/i.test(u);
const take = (xs: string[], n: number) => xs.map((x) => x.trim()).filter(Boolean).slice(0, n);
const mmdd = (v: string) => (/^\d{2}-\d{2}$/.test(v) ? v : /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.slice(5) : "");
const isIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

async function base(deps: FeatureDeps, userId: string, spaceId: string) {
  const data = deps.db ?? appDb;
  return data.withUser(userId, async (tx) => {
    const [space, me, ctx] = await Promise.all([loadSpaceContext(tx, spaceId), loadMe(tx, userId), userContext(tx)]);
    return { space, me, ctx, meText: meBlock(me, space) };
  });
}

/* ======================================================================= research */

/**
 * Research one person in one Space. Work Spaces get a full dossier; Personal, Dating and other
 * Spaces get "Get to know" (conversation starters) or Verify. Never across Spaces (§4.7).
 */
export async function researchPerson(deps: FeatureDeps, userId: string, input: { personId: string; spaceId: string; mode: "research" | "verify"; pasted?: string; jobId?: string }, progress: Progress = noop) {
  const data = deps.db ?? appDb;
  const b = await base(deps, userId, input.spaceId);
  const today = b.ctx.today;
  const person = await data.withUser(userId, (tx) => loadPersonContext(tx, input.spaceId, input.personId));
  if (!person) throw new AiError("failed", "They're not in this Space.");
  const mode = b.space.researchMode;
  if (mode === "off") throw new AiError("failed", "Research is off in this Space.");
  if (input.mode === "research" && mode === "full" && b.space.space.kind !== "work") throw new AiError("failed", "Full research is only for Work Spaces.");
  const savedLinks = Object.values(person.identity.socials ?? {}).filter(isHttp);
  const run = { userId, feature: "research" as const, tier: "strong" as const, onProgress: progress };

  let dossier: { mode: string; payload: unknown; sources: Source[]; confidence: string; promptVersion: string; model: string };
  const suggestions: NewSuggestion[] = [];
  // Full research remembers pasted material (prototype sourceNotes, L1580): none given means last time's.
  let keepPasted: string | null | undefined;
  if (input.mode === "verify") {
    const r = await runAI({ ...run, prompt: verifyPrompt({ today, person: personBlock(person, { today }) }), schema: verifySchema, web: { search: { maxUses: 4 }, fetch: { maxUses: 3 } } }, deps);
    dossier = { mode: "verify", payload: { ...r.output, redFlags: take(r.output.redFlags, 6) }, sources: mergeSources(r.output.sources, r.seen), confidence: r.output.answer, promptVersion: VERIFY_VERSION, model: r.model };
  } else if (mode === "get_to_know") {
    const r = await runAI(
      {
        ...run,
        prompt: getToKnowPrompt({ today, me: b.meText, person: personBlock(person, { today }), space: b.space.space.name }),
        schema: getToKnowSchema,
        // Saved links are opened first (fetch is limited to what's already in the conversation).
        web: { search: { maxUses: 3 }, fetch: { maxUses: Math.max(1, Math.min(3, savedLinks.length || 2)) } },
      },
      deps,
    );
    const items = (xs: { text: string; url: string }[]) => xs.filter((x) => x.text.trim()).slice(0, 5).map((x) => ({ text: x.text.trim(), url: isHttp(x.url) ? x.url : "" }));
    dossier = {
      mode: "get_to_know",
      payload: { identity: r.output.identity, sharedInterests: items(r.output.sharedInterests), thingsToAsk: items(r.output.thingsToAsk), funFacts: items(r.output.funFacts), caveats: r.output.caveats },
      sources: mergeSources(r.output.sources, r.seen),
      confidence: r.output.confidence,
      promptVersion: GET_TO_KNOW_VERSION,
      model: r.model,
    };
    const starters = [...items(r.output.thingsToAsk), ...items(r.output.sharedInterests)].slice(0, 4).map((x) => `- ${x.text}`);
    if (starters.length) suggestions.push({ kind: "note", spaceId: input.spaceId, targetId: input.personId, why: "Conversation starters from Get to know", payload: { personId: input.personId, spaceId: input.spaceId, text: `Things to talk about:\n${starters.join("\n")}` } });
  } else {
    const saved = person.relationship.sourceNotes ?? "";
    const pasted = (input.pasted ?? saved).trim().slice(0, 12000);
    if (input.pasted !== undefined && pasted !== saved) keepPasted = pasted || null;
    const r = await runWithWebFallback(
      {
        ...run,
        effort: "high",
        prompt: (m) =>
          researchFullPrompt({
            today,
            web: webRules(m, "their saved social profiles and handles; their full name with their company, role and city; their LinkedIn; recent news, talks or posts; their organisation"),
            identity: identityRules(m),
            me: b.meText,
            person: personBlock(person, { history: true, today }),
            pasted,
          }),
        schema: researchFullSchema,
        web: { search: { maxUses: 4 }, fetch: { maxUses: 3 } },
      },
      deps,
    );
    const o = r.output;
    const profiles = Object.fromEntries(Object.entries(o.profiles).filter(([, v]) => isHttp(v)));
    const found = { position: o.found.position.trim(), company: o.found.company.trim(), city: o.found.city.trim(), birthday: mmdd(o.found.birthday.trim()) };
    const sources = r.mode === "web" ? mergeSources(o.sources, r.seen) : [];
    dossier = {
      mode: "full",
      payload: {
        identity: o.identity,
        matched: take(o.matched, 8),
        conflicts: take(o.conflicts, 6),
        summary: o.summary,
        career: take(o.career, 8),
        company: o.company,
        signals: take(o.signals, 8),
        sharedInterests: take(o.sharedInterests, 6),
        talkingPoints: take(o.talkingPoints, 6),
        opportunities: take(o.opportunities, 5),
        profiles,
        found,
        caveats: o.caveats,
        /** The saved details this run drew on (prototype `used`). */
        used: [...profileUsed(person), ...(pasted ? ["material you pasted"] : [])],
        /** "knowledge" when the web tools weren't available: show KNOWLEDGE_ONLY_BADGE. */
        answeredFrom: r.mode,
      },
      sources,
      confidence: o.confidence,
      promptVersion: RESEARCH_FULL_VERSION,
      model: r.model,
    };
    // Details it found become suggestions, only where nothing is saved yet. Never silent.
    const id = person.identity;
    for (const field of ["position", "company", "city", "birthday"] as const) {
      if (found[field] && !id[field]) suggestions.push({ kind: "person_field", spaceId: input.spaceId, targetId: input.personId, why: `Found by research (${o.confidence} confidence)`, sources: sources.slice(0, 3), payload: { personId: input.personId, field, value: found[field] } });
    }
    for (const [key, value] of Object.entries(profiles)) {
      if (!(id.socials ?? {})[key]) suggestions.push({ kind: "social", spaceId: input.spaceId, targetId: input.personId, why: "Profile found by research", sources: [{ title: key, url: value }], payload: { personId: input.personId, key, value } });
    }
    const goal = b.space.goals.find((g) => g.id === o.goalId);
    if (goal && !person.goals.some((g) => g.goal === goal.text)) {
      suggestions.push({ kind: "goal_link", spaceId: input.spaceId, targetId: input.personId, why: o.scoreWhy || `Could help with "${goal.text}"`, payload: { personId: input.personId, goalId: goal.id, goalText: goal.text } });
    }
    if (Number.isFinite(o.score) && b.space.goals.length) {
      await data.withUser(userId, (tx) =>
        tx.insert(t.scores).values({ userId, personId: input.personId, goalId: goal?.id ?? null, value: Math.max(0, Math.min(100, Math.round(o.score))), why: o.scoreWhy.slice(0, 240), model: r.model }),
      );
    }
  }

  return data.withUser(userId, async (tx) => {
    const [{ v }] = await tx.select({ v: sql<number>`coalesce(max(version), 0)::int` }).from(t.dossiers).where(and(eq(t.dossiers.personId, input.personId), eq(t.dossiers.spaceId, input.spaceId)));
    const [row] = await tx
      .insert(t.dossiers)
      .values({ userId, personId: input.personId, spaceId: input.spaceId, version: v + 1, mode: dossier.mode, payload: dossier.payload, sources: dossier.sources, confidence: dossier.confidence, model: dossier.model, promptVersion: dossier.promptVersion, jobId: input.jobId ?? null })
      .returning({ id: t.dossiers.id });
    if (keepPasted !== undefined) {
      await tx.update(t.personSpaces).set({ sourceNotes: keepPasted }).where(and(eq(t.personSpaces.personId, input.personId), eq(t.personSpaces.spaceId, input.spaceId)));
    }
    const n = await createSuggestions(tx, userId, "research", row.id, suggestions);
    return { dossierId: row.id, personId: input.personId, suggestions: n };
  });
}

/* ======================================================================= look up */

type Known = { text: string; names: string[]; used: string[]; personId: string };

/** The people in a Space, light, for matching a look-up's name, handle or company. */
async function spacePeople(tx: Tx, spaceId: string) {
  const rows = await tx
    .select({ id: t.people.id, name: t.people.name, company: t.people.company, socials: t.people.socials })
    .from(t.personSpaces)
    .innerJoin(t.people, eq(t.people.id, t.personSpaces.personId))
    .where(and(eq(t.personSpaces.spaceId, spaceId), isNull(t.personSpaces.archivedAt), isNull(t.people.deletedAt)))
    .orderBy(desc(t.personSpaces.starred), asc(t.people.name));
  return rows.map((r) => ({ ...r, socials: (r.socials ?? {}) as Record<string, string> }));
}

/**
 * What I've already saved about a look-up's target (prototype knownFor(), L1536): the room it
 * was started from; else people matching the name or a saved handle; rooms on my list matching
 * an event's title; or people who work at a company or place.
 */
async function knownFor(tx: Tx, input: { spaceId: string; type: LookupType; q: string; personId?: string; eventId?: string }, today: IsoDate): Promise<Known> {
  const out: Known = { text: "", names: [], used: [], personId: "" };
  if (input.eventId) {
    // A room's prep: what's saved about the room steers the search to the right event.
    const room = await roomForPrep(tx, input.eventId, input.spaceId);
    if (!room) throw new AiError("failed", "That room isn't in this Space.");
    return { ...out, text: room };
  }
  const blocks: string[] = [];
  if (input.type === "person") {
    const ids = input.personId ? [input.personId] : matchPeople(input.q, await spacePeople(tx, input.spaceId)).map((p) => p.id);
    const found: string[] = [];
    for (const id of ids) {
      const p = await loadPersonContext(tx, input.spaceId, id);
      if (!p) continue;
      blocks.push(`IN MY NETWORK: ${p.identity.name}\n${personBlock(p, { history: true, today })}`);
      out.names.push(p.identity.name);
      out.used.push(...profileUsed(p));
      found.push(id);
    }
    if (found.length === 1) out.personId = found[0];
  } else if (input.type === "event") {
    const rooms = await tx
      .select()
      .from(t.events)
      .where(and(eq(t.events.spaceId, input.spaceId), isNull(t.events.deletedAt), isNull(t.events.archivedAt)));
    for (const e of matchEvents(input.q, rooms)) {
      const people = await tx
        .selectDistinct({ name: t.people.name, company: t.people.company })
        .from(t.eventPeople)
        .innerJoin(t.people, eq(t.people.id, t.eventPeople.personId))
        .where(and(eq(t.eventPeople.eventId, e.id), isNull(t.people.deletedAt)))
        .limit(20);
      blocks.push(`ON MY EVENTS LIST: ${e.title}\n${eventBlock({ ...e, recurrence: recurrenceOf(e), people }, today)}`);
      out.names.push(e.title);
    }
  } else {
    for (const c of matchCompany(input.q, await spacePeople(tx, input.spaceId))) {
      const p = await loadPersonContext(tx, input.spaceId, c.id);
      if (!p) continue;
      blocks.push(`IN MY NETWORK, WORKS THERE: ${p.identity.name}\n${personBlock(p, { today })}`);
      out.names.push(p.identity.name);
    }
  }
  out.text = blocks.join("\n\n");
  out.used = [...new Set(out.used)];
  return out;
}

/** "Look up" a person, company, place or event: who matters there and how you're connected. */
export async function lookUp(deps: FeatureDeps, userId: string, input: { spaceId: string; type: LookupType; q: string; context?: string; personId?: string; eventId?: string }, progress: Progress = noop) {
  const data = deps.db ?? appDb;
  const b = await base(deps, userId, input.spaceId);
  const { network, known } = await data.withUser(userId, async (tx) => {
    const network = await loadNetworkDigest(tx, input.spaceId);
    const known = await knownFor(tx, input, b.ctx.today);
    return { network, known };
  });
  const networkRows = network.map((n) => [n.id, n.name, n.position, n.company, n.whereMet, n.tags.join("/"), n.interests.slice(0, 3).join("/")].map(cell).join(" | ")).join("\n");
  const r = await runWithWebFallback(
    {
      userId,
      feature: "lookup",
      tier: "strong",
      onProgress: progress,
      prompt: (m) =>
        lookupPrompt({
          type: input.type,
          q: input.q,
          today: b.ctx.today,
          web: webRules(m, lookupWhat(input.type)),
          known: known.text,
          context: input.context ?? "",
          me: b.meText,
          network: networkRows,
          identity: identityRules(m),
        }),
      schema: lookupSchema,
      web: { search: { maxUses: 4 }, fetch: { maxUses: 3 } },
    },
    deps,
  );
  const o = r.output;
  // Warm paths may only point at people in this Space (validated, not trusted).
  const ids = new Set(network.map((n) => n.id));
  const local = localPaths([o.title, input.q, ...o.stakeholders.map((s) => s.name)], network);
  const seen = new Set<string>();
  const warmPaths = [...o.warmPaths.filter((w) => ids.has(w.contactId)), ...local].filter((w) => !seen.has(w.contactId) && seen.add(w.contactId)).slice(0, 10);
  const result = {
    ...o,
    website: isHttp(o.website) ? o.website : "",
    facts: take(o.facts, 8),
    stakeholders: o.stakeholders.slice(0, 8).map((s) => ({ ...s, url: isHttp(s.url) ? s.url : "" })),
    warmPaths: warmPaths.map((w) => ({ ...w, name: network.find((n) => n.id === w.contactId)?.name ?? "" })),
    opportunities: o.opportunities.filter((x) => x.idea).slice(0, 5),
    playbook: take(o.playbook, 6),
    when: input.type === "event" ? cleanWhen(o.when, b.ctx.today) : null,
    /** What it recognised from what you'd saved: "Using what you saved about Ada…". */
    usedNames: known.names,
    used: known.used,
    /** The one saved person it matched, so the result can link to them. */
    personId: known.personId || null,
    answeredFrom: r.mode,
  };
  return data.withUser(userId, async (tx) => {
    const [row] = await tx
      .insert(t.searches)
      .values({ userId, spaceId: input.spaceId, type: input.type, query: input.q.slice(0, 200), result, sources: r.mode === "web" ? mergeSources(o.sources, r.seen) : [], model: r.model, promptVersion: LOOKUP_VERSION, eventId: input.eventId ?? null })
      .returning({ id: t.searches.id });
    return { searchId: row.id };
  });
}

/** The model's dates and times, kept only when they're well-formed and not in the past. */
export function cleanWhen(w: Lookup["when"], today: IsoDate) {
  const time = (v: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? v.trim() : "");
  const startsOn = isIso(w.startsOn.trim()) && w.startsOn.trim() >= today ? w.startsOn.trim() : "";
  const endsOn = startsOn && isIso(w.endsOn.trim()) && w.endsOn.trim() >= startsOn ? w.endsOn.trim() : "";
  return {
    startsOn,
    endsOn,
    startTime: startsOn ? time(w.startTime) : "",
    endTime: startsOn ? time(w.endTime) : "",
    timezone: isValidTimeZone(w.timezone.trim()) ? w.timezone.trim() : "",
    venue: w.venue.trim().slice(0, 200),
    url: isHttp(w.url.trim()) ? w.url.trim() : "",
  };
}

async function roomForPrep(tx: Tx, eventId: string, spaceId: string) {
  const [room] = await tx
    .select({ title: t.events.title, startsOn: t.events.startsOn, startTime: t.events.startTime, location: t.events.location, url: t.events.url, notes: t.events.notes })
    .from(t.events)
    .where(and(eq(t.events.id, eventId), eq(t.events.spaceId, spaceId), isNull(t.events.deletedAt)));
  if (!room) return null;
  const going = await tx
    .select({ name: t.people.name, role: t.eventPeople.role })
    .from(t.eventPeople)
    .innerJoin(t.people, eq(t.people.id, t.eventPeople.personId))
    .where(eq(t.eventPeople.eventId, eventId))
    .limit(20);
  return [
    `ROOM ON MY LIST: ${room.title}`,
    `Date I saved: ${room.startsOn}${room.startTime ? ` ${room.startTime.slice(0, 5)}` : ""}`,
    room.location && `Where: ${room.location}`,
    room.url && `Event page (open this first): ${room.url}`,
    room.notes && `My notes: ${room.notes.slice(0, 2000)}`,
    going.length && `People I've linked to it: ${going.map((g) => `${g.name} (${g.role})`).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ======================================================================= suggested rooms */

export async function suggestRooms(deps: FeatureDeps, userId: string, input: { spaceId: string }, progress: Progress = noop) {
  const data = deps.db ?? appDb;
  const b = await base(deps, userId, input.spaceId);
  const horizon = addDays(b.ctx.today, 21);
  const { gathers, top, mine } = await data.withUser(userId, async (tx) => {
    const gathers = await tx
      .select({ label: t.personSpaces.whereMet, n: sql<number>`count(*)::int` })
      .from(t.personSpaces)
      .where(and(eq(t.personSpaces.spaceId, input.spaceId), sql`${t.personSpaces.whereMet} is not null`))
      .groupBy(t.personSpaces.whereMet)
      .orderBy(desc(sql`count(*)`))
      .limit(7);
    const mine = await tx
      .select({ title: t.events.title, rrule: t.events.rrule, startsOn: t.events.startsOn, untilOn: t.events.untilOn })
      .from(t.events)
      .where(and(eq(t.events.spaceId, input.spaceId), isNull(t.events.deletedAt)))
      .limit(30);
    return {
      gathers: gathers.map((g) => `${g.label} (${g.n})`).join(", "),
      top: gathers[0]?.label ?? null,
      mine: mine.map((m) => `${m.title} (${recurrenceLabel(recurrenceOf(m))})`).join("; "),
    };
  });
  const r = await runWithWebFallback(
    {
      userId,
      feature: "radar",
      tier: "strong",
      onProgress: progress,
      prompt: (m) => radarPrompt({ mode: m, today: b.ctx.today, horizon, me: b.meText, city: homeCity(b.me.location, top), gathers, mine }),
      schema: radarSchema,
      // The time zone is only a location hint for the search tool, never "my city".
      web: { search: { maxUses: 5, userLocation: b.me.location ? { city: b.me.location } : { timezone: b.ctx.timezone } }, fetch: { maxUses: 3 } },
    },
    deps,
  );
  const items = r.output.items
    .filter((x) => x.title.trim())
    .slice(0, 8)
    .map((x) => ({ ...x, date: isIso(x.date) ? x.date : "", time: /^\d{2}:\d{2}$/.test(x.time) ? x.time : "", url: isHttp(x.url) ? x.url : "", id: crypto.randomUUID() }))
    .sort((a, c) => (a.date || "9999").localeCompare(c.date || "9999"));
  if (!items.length) throw new AiError("invalid_output", "No rooms came back this time. Try again later.");
  return data.withUser(userId, async (tx) => {
    const [row] = await tx
      .insert(t.searches)
      .values({ userId, spaceId: input.spaceId, type: "radar", query: `${b.ctx.today}..${horizon}`, result: { items, from: b.ctx.today, to: horizon, answeredFrom: r.mode }, sources: r.mode === "web" ? mergeSources(r.output.sources, r.seen) : [], model: r.model, promptVersion: RADAR_VERSION })
      .returning({ id: t.searches.id });
    return { searchId: row.id };
  });
}

/* ======================================================================= briefs */

/**
 * People in a Space who are going cold, as the prototype's coldList() (L598): past their
 * reminder interval since the last touch, and starred or scored 40+ (no score counts as 50).
 * Highest score first, then the longest silence. Up to 8.
 */
async function coldList(tx: Tx, spaceId: string, today: IsoDate) {
  const rows = await tx.execute<{ id: string; score: number | null }>(sql`
    ${personRollup([sql`ps.archived_at is null`, sql`ps.space_id = ${spaceId}`])}
    select id, score from (
      select id, starred, last_touched_on,
             (select s.value from scores s where s.person_id = base.id and (s.goal_id is null or s.goal_id in (select g.id from goals g where g.space_id = ${spaceId})) order by s.created_at desc limit 1)::int as score
        from base
       where deleted_at is null and not unsorted and last_touched_on is not null and r_due_on < ${today}::date
    ) x
    where starred or coalesce(score, 50) >= 40
    order by coalesce(score, 50) desc, last_touched_on asc
    limit 8`);
  return [...rows];
}

/** The daily or weekly brief for one Space. Never mixes Spaces (§4.7). */
export async function writeBrief(deps: FeatureDeps, userId: string, input: { spaceId: string; kind: "daily" | "weekly" }, progress: Progress = noop) {
  const data = deps.db ?? appDb;
  const b = await base(deps, userId, input.spaceId);
  const today = b.ctx.today;
  const c = { spaceId: input.spaceId, today, tz: b.ctx.timezone };
  const contexts = async (tx: Tx, ids: string[]) => {
    const out = new Map<string, PersonContext>();
    for (const id of new Set(ids)) {
      const p = await loadPersonContext(tx, input.spaceId, id);
      if (p) out.set(id, p);
    }
    return out;
  };
  const inputs = await data.withUser(userId, async (tx: Tx) => {
    const nudges = (await listNudges(tx, c)).map((n) => ({ kind: n.kind, title: n.title, detail: n.body }));
    if (input.kind === "daily") {
      const entries = await todayAgenda(tx, c);
      const people = await contexts(
        tx,
        entries.flatMap((a) => a.attendees.map((p) => p.id)),
      );
      const agenda = entries.map((a) => ({
        time: a.time ?? "all day",
        title: a.title,
        location: a.location,
        people: a.attendees.map((p) => {
          const pc = people.get(p.id);
          return pc ? briefPerson(pc) : { name: p.name, role: p.detail || "No role added yet" };
        }),
      }));
      const companies = [...new Set([...people.values()].map((p) => p.identity.company?.trim() ?? "").filter((x) => x && !/^independent$/i.test(x)))].slice(0, 4);
      return { agenda, nudges, companies, rooms: [], cold: [], goals: [], openings: [] };
    }
    const upcoming = await listUpcoming(tx, input.spaceId, today, b.ctx.timezone, 7);
    const eventIds = [...new Set(upcoming.map((r) => r.eventId))];
    const linked = eventIds.length
      ? await tx
          .selectDistinct({ eventId: t.eventPeople.eventId, name: t.people.name })
          .from(t.eventPeople)
          .innerJoin(t.people, eq(t.people.id, t.eventPeople.personId))
          .where(and(inArray(t.eventPeople.eventId, eventIds), isNull(t.people.deletedAt)))
      : [];
    const rooms = upcoming.map((r) => ({ date: r.date, time: r.time, title: r.title, kind: r.kind, people: linked.filter((l) => l.eventId === r.eventId).map((l) => l.name) }));
    const coldRows = await coldList(tx, input.spaceId, today);
    const coldPeople = await contexts(
      tx,
      coldRows.map((r) => r.id),
    );
    const cold = coldRows.flatMap((r) => {
      const pc = coldPeople.get(r.id);
      return pc ? [{ ...briefPerson(pc), daysSinceTouch: warmth(pc.identity.lastTouchedOn, today).days, score: r.score }] : [];
    });
    const goals = (await listGoals(tx, { spaceId: input.spaceId, today, tz: b.ctx.timezone }))
      .filter((g) => g.active)
      .map((g) => ({ goal: g.text, priority: goalPriorityLabels[g.priority as 1 | 2 | 3] ?? "Medium", linked: g.people, ...g.progress }));
    const openings = await tx
      .select({ payload: t.dossiers.payload, name: t.people.name })
      .from(t.dossiers)
      .innerJoin(t.people, eq(t.people.id, t.dossiers.personId))
      .where(and(eq(t.dossiers.spaceId, input.spaceId), eq(t.dossiers.mode, "full"), gte(t.dossiers.createdAt, new Date(Date.now() - 7 * 86_400_000))))
      .limit(10);
    return { agenda: [], companies: [], rooms, cold, goals, nudges, openings: openings.map((o) => ({ name: o.name, opportunities: (o.payload as { opportunities?: string[] }).opportunities ?? [] })) };
  });
  const week = { from: weekOf(today).start, to: weekOf(today).end };
  const run = { userId, feature: "brief" as const, tier: "strong" as const, onProgress: progress };
  const daily = (news: string[]) => dailyBriefPrompt({ date: formatLongDate(today), me: b.meText, agenda: inputs.agenda, nudges: inputs.nudges, news });
  const r =
    input.kind === "daily" && inputs.companies.length
      ? // News searches need the web; without it the brief is written from the data alone.
        await runWithWebFallback<string>({ ...run, web: { search: { maxUses: 2 } }, prompt: (m) => daily(m === "web" ? inputs.companies : []) }, deps)
      : await runAI(
          {
            ...run,
            prompt:
              input.kind === "daily"
                ? daily([])
                : weeklyBriefPrompt({ from: formatLongDate(week.from), to: formatLongDate(week.to), me: b.meText, rooms: inputs.rooms, cold: inputs.cold, goals: inputs.goals, openings: inputs.openings, nudges: inputs.nudges }),
          },
          deps,
        );
  const periodKey = input.kind === "daily" ? today : `week-of-${weekOf(today).start}`;
  return data.withUser(userId, async (tx) => {
    const [row] = await tx
      .insert(t.briefs)
      .values({ userId, spaceId: input.spaceId, kind: input.kind, periodKey, markdown: r.output.slice(0, 8000), sources: r.seen.slice(0, 8), inputs: { version: BRIEF_VERSION }, model: r.model })
      .onConflictDoUpdate({ target: [t.briefs.userId, t.briefs.spaceId, t.briefs.kind, t.briefs.periodKey], set: { markdown: r.output.slice(0, 8000), sources: r.seen.slice(0, 8), inputs: { version: BRIEF_VERSION }, model: r.model, createdAt: new Date() } })
      .returning({ id: t.briefs.id });
    return { briefId: row.id };
  });
}

/* ======================================================================= scoring */

/** Scores up to 60 people (least recently scored first) against this Space's goals. */
export async function scorePeople(deps: FeatureDeps, userId: string, input: { spaceId: string }, progress: Progress = noop) {
  const data = deps.db ?? appDb;
  const b = await base(deps, userId, input.spaceId);
  if (!b.space.goals.length) throw new AiError("failed", "Add a goal to this Space first, so the scores mean something.");
  const pick = await data.withUser(userId, (tx) =>
    tx
      .select({ id: t.people.id, name: t.people.name, position: t.people.position, company: t.people.company, whereMet: t.personSpaces.whereMet, interests: t.personSpaces.interests, notes: t.personSpaces.notes, starred: t.personSpaces.starred })
      .from(t.personSpaces)
      .innerJoin(t.people, eq(t.people.id, t.personSpaces.personId))
      .where(and(eq(t.personSpaces.spaceId, input.spaceId), isNull(t.personSpaces.archivedAt), isNull(t.people.deletedAt), eq(t.personSpaces.triageState, "done")))
      .orderBy(sql`(select max(s.created_at) from scores s where s.person_id = people.id) asc nulls first`)
      .limit(60),
  );
  if (!pick.length) throw new AiError("failed", "Add people to this Space first.");
  progress(`Scoring ${pick.length} people`);
  const rows = pick.map((p) => [p.id, p.name, p.position, p.company, p.whereMet, p.interests.join("/"), (p.notes ?? "").replace(/\s+/g, " ").slice(0, 160), p.starred ? "priority" : ""].map(cell).join(" | ")).join("\n");
  const r = await runAI({ userId, feature: "score", tier: "fast", prompt: scorePrompt({ me: b.meText, rows }), schema: scoreSchema }, deps);
  const ids = new Set(pick.map((p) => p.id));
  const goals = new Map(b.space.goals.map((g) => [g.id, g]));
  return data.withUser(userId, async (tx) => {
    const valid = r.output.scores.filter((s) => ids.has(s.id) && Number.isFinite(s.score));
    if (valid.length) {
      await tx.insert(t.scores).values(valid.map((s) => ({ userId, personId: s.id, goalId: goals.has(s.goalId) ? s.goalId : null, value: Math.max(0, Math.min(100, Math.round(s.score))), why: s.why.slice(0, 200), model: r.model })));
    }
    // Strong fits become goal suggestions, never silent links (fixes the prototype's bug 7).
    const onGoal = await tx.select({ personId: t.goalLinks.personId, goalId: t.goalLinks.goalId }).from(t.goalLinks);
    const linked = new Set(onGoal.map((l) => `${l.personId}:${l.goalId}`));
    const sugg = valid
      .filter((s) => s.score >= 60 && goals.has(s.goalId) && !linked.has(`${s.id}:${s.goalId}`))
      .map((s) => ({ kind: "goal_link" as const, spaceId: input.spaceId, targetId: s.id, why: `${Math.round(s.score)}/100: ${s.why}`, payload: { personId: s.id, goalId: s.goalId, goalText: goals.get(s.goalId)!.text } }));
    const n = await createSuggestions(tx, userId, "score", null, sugg);
    return { scored: valid.length, suggestions: n };
  });
}

/* ======================================================================= quick features (no job) */

export async function draftMessage(deps: FeatureDeps, userId: string, input: { personId: string; spaceId: string; purpose: DraftPurpose }) {
  const data = deps.db ?? appDb;
  const b = await base(deps, userId, input.spaceId);
  const person = await data.withUser(userId, (tx) => loadPersonContext(tx, input.spaceId, input.personId));
  if (!person) throw new AiError("failed", "They're not in this Space.");
  const angles = (person.research?.payload as { talkingPoints?: string[] } | undefined)?.talkingPoints ?? [];
  const r = await runAI(
    { userId, feature: "draft", tier: "fast", maxTokens: 2000, prompt: draftPrompt({ purpose: input.purpose, name: person.identity.name, today: b.ctx.today, person: personBlock(person, { today: b.ctx.today }), angles, me: b.meText, space: b.space.space.kind }) },
    deps,
  );
  return { text: r.output.trim(), phone: person.identity.phones[0] ?? null, email: person.identity.emails[0] ?? null };
}

/** Reads a business card photo. Returns details for the Add person form; nothing is saved. */
export async function readCard(deps: FeatureDeps, userId: string, input: { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string; region: string }) {
  const r = await runAI(
    {
      userId,
      feature: "card",
      tier: "fast",
      maxTokens: 2000,
      schema: cardSchema,
      prompt: [
        { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.base64 } },
        { type: "text", text: cardPrompt },
      ],
    },
    deps,
  );
  const o = r.output;
  return { ...o, phone: normalisePhone(o.phone, input.region) ?? o.phone, website: o.website, linkedin: o.linkedin };
}

/**
 * Extracts touches, promises and details from a pasted chat for one person. The text is sent to
 * the model and never stored; the results come back as suggestions to accept.
 */
export async function importChat(deps: FeatureDeps, userId: string, input: { spaceId: string; personId: string; transcript: string; me: string; today: IsoDate }) {
  const data = deps.db ?? appDb;
  const person = await data.withUser(userId, (tx) => loadPersonContext(tx, input.spaceId, input.personId));
  if (!person) throw new AiError("failed", "They're not in this Space.");
  const r = await runAI({ userId, feature: "chat", tier: "fast", schema: chatSchema, prompt: chatPrompt({ me: input.me, other: person.identity.name, today: input.today, transcript: input.transcript.slice(-30000) }) }, deps);
  const o = r.output;
  const p = { personId: input.personId, spaceId: input.spaceId };
  // The last message's date: undated moments land there, and accepting them moves the last touch to it.
  const lastDate = isIso(o.lastDate.trim()) && o.lastDate.trim() <= input.today ? o.lastDate.trim() : input.today;
  const list: NewSuggestion[] = [
    ...o.interactions.filter((i) => i.summary.trim()).slice(0, 8).map((i) => ({ kind: "interaction" as const, ...p, targetId: input.personId, why: "From the chat", payload: { ...p, occurredOn: isIso(i.date) && i.date <= input.today ? i.date : lastDate, summary: i.summary } })),
    ...o.commitments.filter((c) => c.text.trim()).slice(0, 8).map((c) => ({ kind: "commitment" as const, ...p, targetId: input.personId, why: c.owner === "me" ? "You promised this in the chat" : "They promised this in the chat", payload: { ...p, text: c.text, owner: c.owner, dueOn: isIso(c.due) ? c.due : null } })),
  ];
  for (const field of ["company", "position"] as const) {
    const v = o.details[field].trim();
    if (v && !person.identity[field]) list.push({ kind: "person_field", ...p, targetId: input.personId, why: "Mentioned in the chat", payload: { personId: input.personId, field, value: v } });
  }
  const bday = mmdd(o.details.birthday.trim());
  if (bday && !person.identity.birthday) list.push({ kind: "person_field", ...p, targetId: input.personId, why: "Mentioned in the chat", payload: { personId: input.personId, field: "birthday", value: bday } });
  const interests = take(o.details.interests, 8).filter((x) => !person.relationship.interests.includes(x));
  if (interests.length) list.push({ kind: "interests", ...p, targetId: input.personId, why: "Mentioned in the chat", payload: { ...p, values: interests } });
  // The prototype's "From chat" note (L1932): the summary and the other useful details.
  const fromChat = [o.summary.trim() && `From chat (${shortDate(input.today)}): ${o.summary.trim()}`, ...take(o.details.other, 5)].filter(Boolean).join("\n");
  if (fromChat) list.push({ kind: "note", ...p, targetId: input.personId, why: "Summary of the chat", payload: { ...p, text: fromChat.slice(0, 2000) } });
  // The prototype's "Family: …" line, as its own suggestion so it can be kept or dismissed on its own.
  const family = o.details.family.trim();
  if (family) list.push({ kind: "note", ...p, targetId: input.personId, why: "Mentioned in the chat", payload: { ...p, text: `Family: ${family}`.slice(0, 1000) } });
  if (o.nextStep.trim()) list.push({ kind: "note", ...p, targetId: input.personId, why: "Suggested next step", payload: { ...p, text: `Next step: ${o.nextStep.trim()}` } });
  const n = await data.withUser(userId, (tx) => createSuggestions(tx, userId, "chat", null, list));
  return { summary: o.summary, sentiment: o.sentiment, suggestions: n };
}

