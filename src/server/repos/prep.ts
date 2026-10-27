import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { addDays, type IsoDate } from "@/domain/dates";
import type { RoomRole } from "@/contracts/rooms";
import type { Lookup } from "@/server/ai/prompts/lookup";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { addGoalStep } from "./goal-steps";
import { linkPeople } from "./goals";
import { createPerson } from "./people";
import { linkPerson } from "./rooms";
import type { Result } from "./spaces";

const fail = (message: string, field?: string): Result<never> => ({ ok: false, message, field });

/** A saved look-up as stored in `searches.result` (warm paths carry the contact's name). */
export type SavedLookup = Omit<Lookup, "warmPaths" | "when"> & {
  warmPaths: (Lookup["warmPaths"][number] & { name: string })[];
  when?: Lookup["when"] | null;
};

export type Plan = {
  id: string;
  spaceId: string;
  eventId: string | null;
  createdAt: Date;
  result: SavedLookup;
  /** Index of each stakeholder already saved, with the person it became. */
  keptPeople: Record<number, string>;
  /** Indexes of openings already added as goal steps. */
  keptSteps: number[];
  goals: { id: string; text: string }[];
};

async function loadSearch(tx: Tx, searchId: string) {
  const [row] = await tx
    .select({ id: t.searches.id, spaceId: t.searches.spaceId, eventId: t.searches.eventId, type: t.searches.type, result: t.searches.result, createdAt: t.searches.createdAt })
    .from(t.searches)
    .where(eq(t.searches.id, searchId));
  return row && row.type !== "radar" ? { ...row, result: row.result as SavedLookup } : null;
}

/** What a look-up found, shaped to fill in a room. */
export function roomDetailsOf(plan: Plan) {
  const r = plan.result;
  const named = r.stakeholders.filter((x) => x.name.trim());
  // The goal the plan's openings serve, if it's one of yours.
  const goal = r.opportunities.map((o) => matchGoal(plan.goals, o.goal)).find(Boolean) ?? null;
  return {
    title: r.title,
    when: r.when ?? null,
    website: r.website,
    overview: r.overview,
    facts: r.facts.slice(0, 5),
    meet: named.slice(0, 3).map((x) => ({ name: x.name.trim(), role: x.role.trim() })),
    people: named.length,
    openings: r.opportunities.length,
    goalId: goal?.id ?? null,
  };
}

/** A look-up with what's already been kept from it, ready to act on. */
export async function loadPlan(tx: Tx, searchId: string): Promise<Plan | null> {
  const s = await loadSearch(tx, searchId);
  if (!s) return null;
  const names = s.result.stakeholders.map((x) => x.name.trim().toLowerCase()).filter(Boolean);
  const people = names.length
    ? await tx
        .select({ id: t.people.id, name: sql<string>`lower(${t.people.name})` })
        .from(t.people)
        .innerJoin(t.personSpaces, and(eq(t.personSpaces.personId, t.people.id), eq(t.personSpaces.spaceId, s.spaceId)))
        .where(and(inArray(sql`lower(${t.people.name})`, names), isNull(t.people.deletedAt)))
    : [];
  const byName = new Map(people.map((p) => [p.name, p.id]));
  const keptPeople: Record<number, string> = {};
  s.result.stakeholders.forEach((x, i) => {
    const id = byName.get(x.name.trim().toLowerCase());
    if (id) keptPeople[i] = id;
  });
  const steps = await tx.select({ text: t.goalSteps.text }).from(t.goalSteps).where(eq(t.goalSteps.searchId, s.id));
  const stepTexts = new Set(steps.map((x) => x.text));
  const keptSteps = s.result.opportunities.flatMap((o, i) => (stepTexts.has(stepText(o)) ? [i] : []));
  const goals = await tx
    .select({ id: t.goals.id, text: t.goals.text })
    .from(t.goals)
    .where(and(eq(t.goals.spaceId, s.spaceId), eq(t.goals.active, true), isNull(t.goals.archivedAt), eq(t.goals.example, false)))
    .orderBy(t.goals.priority, t.goals.createdAt);
  return { id: s.id, spaceId: s.spaceId, eventId: s.eventId, createdAt: s.createdAt, result: s.result, keptPeople, keptSteps, goals };
}

/** The newest prep for a room, if any. */
export async function latestPrepId(tx: Tx, eventId: string): Promise<string | null> {
  const [row] = await tx.select({ id: t.searches.id }).from(t.searches).where(eq(t.searches.eventId, eventId)).orderBy(desc(t.searches.createdAt)).limit(1);
  return row?.id ?? null;
}

/** A look-up run from the Add a room form becomes the new room's prep once it's saved. */
export async function attachPrep(tx: Tx, searchId: string, eventId: string) {
  await tx
    .update(t.searches)
    .set({ eventId })
    .where(and(eq(t.searches.id, searchId), eq(t.searches.type, "event"), isNull(t.searches.eventId)));
}

const stepText = (o: Lookup["opportunities"][number]) => (o.firstMove.trim() || o.idea.trim()).slice(0, 300);

/** The goal an opening names, if it matches one of yours. */
export function matchGoal(goals: { id: string; text: string }[], named: string) {
  const n = named.trim().toLowerCase();
  if (!n) return null;
  return goals.find((g) => g.text.toLowerCase() === n) ?? goals.find((g) => n.includes(g.text.toLowerCase()) || g.text.toLowerCase().includes(n)) ?? null;
}

function roomRoleFor(role: string): RoomRole {
  if (/speak|panel|keynote|moderat|judge|mentor/i.test(role)) return "speaker";
  if (/organi[sz]|host|curat|founder of|producer|run(s|ning) the/i.test(role)) return "organiser";
  return "attendee";
}

function socialsFor(url: string) {
  if (!/^https?:\/\//i.test(url)) return {};
  if (/linkedin\.com\//i.test(url)) return { linkedin: url };
  if (/(twitter|x)\.com\//i.test(url)) return { x: url };
  return { website: url };
}

/**
 * Keep someone the plan named: reuse the contact if you already have them in this Space,
 * otherwise save them; then add them to the goal and, for a room's prep, to the room.
 */
export async function keepStakeholder(
  tx: Tx,
  userId: string,
  input: { searchId: string; index: number; goalId: string | null },
  today: IsoDate,
): Promise<Result<{ personId: string; created: boolean }>> {
  const s = await loadSearch(tx, input.searchId);
  const who = s?.result.stakeholders[input.index];
  if (!s || !who) return fail("That plan has changed. Reload the page.");
  const name = who.name.trim();
  if (!name) return fail("This is a role, not a named person yet. Find who holds it first.");

  const [existing] = await tx
    .select({ id: t.people.id })
    .from(t.people)
    .innerJoin(t.personSpaces, and(eq(t.personSpaces.personId, t.people.id), eq(t.personSpaces.spaceId, s.spaceId)))
    .where(and(sql`lower(${t.people.name}) = ${name.toLowerCase()}`, isNull(t.people.deletedAt)))
    .limit(1);
  let personId = existing?.id;
  if (!personId) {
    const title = s.result.title || "a look-up";
    const created = await createPerson(
      tx,
      userId,
      {
        id: randomUUID(),
        identity: { name: name.slice(0, 120), position: who.role.trim().slice(0, 120) || null, socials: socialsFor(who.url.trim()) },
        membership: { spaceId: s.spaceId, notes: [s.type === "role" ? `Found by your research step "${title}".` : `From your plan for ${title}.`, who.why.trim()].filter(Boolean).join(" ").slice(0, 2000) },
      },
      today,
    );
    if (!created.ok) return created;
    personId = created.data.id;
  }
  if (input.goalId) {
    const linked = await linkPeople(tx, userId, input.goalId, [personId]);
    if (!linked.ok) return linked;
  }
  if (s.eventId) await linkPerson(tx, userId, s.eventId, personId, roomRoleFor(who.role));
  return { ok: true, data: { personId, created: !existing } };
}

/** Turn an opening's first move into a step on a goal, due before the room (or within a week). */
export async function keepOpening(tx: Tx, userId: string, input: { searchId: string; index: number; goalId: string }, today: IsoDate): Promise<Result<{ id: string }>> {
  const s = await loadSearch(tx, input.searchId);
  const o = s?.result.opportunities[input.index];
  if (!s || !o) return fail("That plan has changed. Reload the page.");
  const [goal] = await tx.select({ spaceId: t.goals.spaceId }).from(t.goals).where(eq(t.goals.id, input.goalId));
  if (!goal || goal.spaceId !== s.spaceId) return fail("Choose a goal in this Space.");
  let dueOn = addDays(today, 7);
  if (s.eventId) {
    const [room] = await tx.select({ startsOn: t.events.startsOn }).from(t.events).where(eq(t.events.id, s.eventId));
    const dayBefore = room ? addDays(room.startsOn, -1) : null;
    if (dayBefore && dayBefore >= today && dayBefore < dueOn) dueOn = dayBefore;
  }
  return addGoalStep(tx, userId, { goalId: input.goalId, text: stepText(o), dueOn }, s.id);
}
