import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { goalSchema, type GoalInput, type GoalType } from "@/contracts/goals";
import { finaliseStages, stageSchema, type SpaceKind, type Stage } from "@/contracts/spaces";
import { addDays, type IsoDate } from "@/domain/dates";
import { classifyMoves, firstOpenStage, weekOf, type WeeklyProgress } from "@/domain/goal-progress";
import { zonedToInstant } from "@/domain/zoned";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { guarded } from "./guarded";
import { getSpace, listSpaces, type Result } from "./spaces";

const fail = (message: string, field?: string): Result<never> => ({ ok: false, message, field });
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const customStages = z.array(stageSchema).min(2);

/** A goal's own stages if it has them, otherwise its Space's. */
export function stagesOf(goalStages: unknown, spaceStages: Stage[]): { stages: Stage[]; custom: boolean } {
  const own = customStages.safeParse(goalStages);
  return own.success ? { stages: own.data, custom: true } : { stages: spaceStages, custom: false };
}

export type GoalSummary = {
  id: string;
  text: string;
  type: GoalType;
  priority: number;
  weeklyTarget: number;
  dueOn: string | null;
  active: boolean;
  archived: boolean;
  space: { id: string; name: string; kind: SpaceKind };
  stages: Stage[];
  counts: Record<string, number>;
  people: number;
  progress: WeeklyProgress;
};

type Week = { start: IsoDate; end: IsoDate; from: Date; to: Date };
function weekBounds(today: IsoDate, tz: string): Week {
  const w = weekOf(today);
  return { ...w, from: zonedToInstant(w.start, "00:00", tz), to: zonedToInstant(addDays(w.end, 1), "00:00", tz) };
}

/** This week's touches, rooms and stage moves for a set of goals (TECH_PLAN §8, bug 8). */
async function weeklyProgress(tx: Tx, goals: { id: string; weeklyTarget: number; stages: Stage[] }[], week: Week) {
  const ids = goals.map((g) => g.id);
  const out = new Map<string, WeeklyProgress>();
  if (!ids.length) return out;
  const [touches, rooms, moves] = await Promise.all([
    // Touches in the goal's Space with people in its pipeline.
    tx
      .select({ goalId: t.goalLinks.goalId, n: sql<number>`count(*)::int`, people: sql<number>`count(distinct ${t.interactions.personId})::int` })
      .from(t.interactions)
      .innerJoin(t.goalLinks, eq(t.goalLinks.personId, t.interactions.personId))
      .innerJoin(t.goals, and(eq(t.goals.id, t.goalLinks.goalId), eq(t.goals.spaceId, t.interactions.spaceId)))
      .where(and(inArray(t.goalLinks.goalId, ids), gte(t.interactions.occurredOn, week.start), sql`${t.interactions.occurredOn} <= ${week.end}`))
      .groupBy(t.goalLinks.goalId),
    // Sessions you went to of rooms tied to the goal.
    tx
      .select({ goalId: t.events.goalId, n: sql<number>`count(*)::int` })
      .from(t.eventAttendance)
      .innerJoin(t.events, eq(t.events.id, t.eventAttendance.eventId))
      .where(
        and(
          inArray(t.events.goalId, ids),
          isNull(t.events.deletedAt),
          eq(t.eventAttendance.attended, true),
          gte(t.eventAttendance.occurrenceOn, week.start),
          sql`${t.eventAttendance.occurrenceOn} <= ${week.end}`,
        ),
      )
      .groupBy(t.events.goalId),
    tx
      .select({ goalId: t.goalLinks.goalId, from: t.goalLinkHistory.fromStage, to: t.goalLinkHistory.toStage })
      .from(t.goalLinkHistory)
      .innerJoin(t.goalLinks, eq(t.goalLinks.id, t.goalLinkHistory.goalLinkId))
      .where(and(inArray(t.goalLinks.goalId, ids), gte(t.goalLinkHistory.movedAt, week.from), lt(t.goalLinkHistory.movedAt, week.to), isNotNull(t.goalLinkHistory.fromStage))),
  ]);
  for (const g of goals) {
    const tc = touches.find((x) => x.goalId === g.id);
    out.set(g.id, {
      touches: tc?.n ?? 0,
      peopleTouched: tc?.people ?? 0,
      rooms: rooms.find((x) => x.goalId === g.id)?.n ?? 0,
      moves: classifyMoves(
        moves.filter((m) => m.goalId === g.id),
        g.stages,
      ),
      target: g.weeklyTarget,
    });
  }
  return out;
}

export async function listGoals(tx: Tx, opts: { spaceId: string | null; today: IsoDate; tz: string; archived?: boolean }): Promise<GoalSummary[]> {
  const rows = await tx
    .select({ g: t.goals, s: t.spaces })
    .from(t.goals)
    .innerJoin(t.spaces, eq(t.spaces.id, t.goals.spaceId))
    .where(
      and(
        opts.archived ? isNotNull(t.goals.archivedAt) : isNull(t.goals.archivedAt),
        isNull(t.spaces.archivedAt),
        opts.spaceId ? eq(t.goals.spaceId, opts.spaceId) : undefined,
      ),
    )
    .orderBy(asc(t.spaces.position), desc(t.goals.active), asc(t.goals.priority), asc(t.goals.createdAt));
  if (!rows.length) return [];
  const spaces = new Map((await listSpaces(tx)).map((sp) => [sp.id, sp]));
  const goals = rows.map(({ g, s }) => ({ g, s, stages: stagesOf(g.stages, spaces.get(s.id)?.defaults.stages ?? []).stages }));
  const ids = goals.map((x) => x.g.id);
  const counts = await tx
    .select({ goalId: t.goalLinks.goalId, stage: t.goalLinks.stage, n: sql<number>`count(*)::int` })
    .from(t.goalLinks)
    .innerJoin(t.people, eq(t.people.id, t.goalLinks.personId))
    .where(and(inArray(t.goalLinks.goalId, ids), isNull(t.people.deletedAt)))
    .groupBy(t.goalLinks.goalId, t.goalLinks.stage);
  const progress = await weeklyProgress(
    tx,
    goals.map((x) => ({ id: x.g.id, weeklyTarget: x.g.weeklyTarget, stages: x.stages })),
    weekBounds(opts.today, opts.tz),
  );
  return goals.map(({ g, s, stages }) => {
    const byStage = Object.fromEntries(counts.filter((c) => c.goalId === g.id).map((c) => [c.stage, c.n]));
    return {
      id: g.id,
      text: g.text,
      type: g.type,
      priority: g.priority,
      weeklyTarget: g.weeklyTarget,
      dueOn: g.dueOn,
      active: g.active,
      archived: Boolean(g.archivedAt),
      space: { id: s.id, name: s.name, kind: s.kind as SpaceKind },
      stages,
      counts: byStage,
      people: Object.values(byStage).reduce((a, b) => a + b, 0),
      progress: progress.get(g.id)!,
    };
  });
}

export type PipelineEntry = {
  linkId: string;
  personId: string;
  name: string;
  detail: string;
  stage: string;
  note: string | null;
  lastTouchedOn: string | null;
  movedAt: Date;
};

export type GoalDetail = GoalSummary & {
  customStages: boolean;
  pipeline: PipelineEntry[];
  rooms: { id: string; title: string }[];
  recent: { name: string; from: string | null; to: string; at: Date }[];
};

export async function getGoal(tx: Tx, id: string, today: IsoDate, tz: string): Promise<GoalDetail | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx.select().from(t.goals).where(eq(t.goals.id, id));
  if (!row) return null;
  const space = await getSpace(tx, row.spaceId);
  if (!space) return null;
  const { stages, custom } = stagesOf(row.stages, space.defaults.stages);
  const lastTouch = sql<string | null>`(select max(i.occurred_on)::text from interactions i where i.person_id = ${t.goalLinks.personId} and i.space_id = ${row.spaceId})`;
  const [links, rooms, recent, progress] = await Promise.all([
    tx
      .select({ l: t.goalLinks, name: t.people.name, company: t.people.company, position: t.people.position, lastTouchedOn: lastTouch })
      .from(t.goalLinks)
      .innerJoin(t.people, eq(t.people.id, t.goalLinks.personId))
      .where(and(eq(t.goalLinks.goalId, id), isNull(t.people.deletedAt)))
      .orderBy(desc(t.goalLinks.updatedAt), asc(t.people.name)),
    tx
      .select({ id: t.events.id, title: t.events.title })
      .from(t.events)
      .where(and(eq(t.events.goalId, id), isNull(t.events.deletedAt)))
      .orderBy(asc(t.events.title)),
    tx
      .select({ name: t.people.name, from: t.goalLinkHistory.fromStage, to: t.goalLinkHistory.toStage, at: t.goalLinkHistory.movedAt })
      .from(t.goalLinkHistory)
      .innerJoin(t.goalLinks, eq(t.goalLinks.id, t.goalLinkHistory.goalLinkId))
      .innerJoin(t.people, eq(t.people.id, t.goalLinks.personId))
      .where(and(eq(t.goalLinks.goalId, id), isNull(t.people.deletedAt)))
      .orderBy(desc(t.goalLinkHistory.movedAt))
      .limit(8),
    weeklyProgress(tx, [{ id, weeklyTarget: row.weeklyTarget, stages }], weekBounds(today, tz)),
  ]);
  const pipeline = links.map(({ l, name, company, position, lastTouchedOn }) => ({
    linkId: l.id,
    personId: l.personId,
    name,
    detail: [position, company].filter(Boolean).join(" at "),
    stage: l.stage,
    note: l.note,
    lastTouchedOn,
    movedAt: l.updatedAt,
  }));
  const counts: Record<string, number> = {};
  for (const p of pipeline) counts[p.stage] = (counts[p.stage] ?? 0) + 1;
  return {
    id: row.id,
    text: row.text,
    type: row.type,
    priority: row.priority,
    weeklyTarget: row.weeklyTarget,
    dueOn: row.dueOn,
    active: row.active,
    archived: Boolean(row.archivedAt),
    space: { id: space.id, name: space.name, kind: space.kind as SpaceKind },
    stages,
    customStages: custom,
    counts,
    people: pipeline.length,
    progress: progress.get(id)!,
    pipeline,
    rooms,
    recent,
  };
}

/** People whose stage isn't one of the goal's stages any more would vanish from the pipeline. */
async function strandedBy(tx: Tx, goalId: string, stages: Stage[]) {
  const keep = new Set(stages.map((s) => s.key));
  const used = await tx.select({ stage: t.goalLinks.stage, n: sql<number>`count(*)::int` }).from(t.goalLinks).where(eq(t.goalLinks.goalId, goalId)).groupBy(t.goalLinks.stage);
  return used.filter((u) => !keep.has(u.stage));
}

export async function createGoal(tx: Tx, userId: string, raw: GoalInput): Promise<Result<{ id: string }>> {
  const parsed = goalSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details.", String(parsed.error.issues[0]?.path[0] ?? ""));
  const input = parsed.data;
  const space = await getSpace(tx, input.spaceId);
  if (!space || space.archivedAt) return fail("Choose one of your Spaces.", "spaceId");
  const [row] = await tx
    .insert(t.goals)
    .values({
      userId,
      spaceId: input.spaceId,
      text: input.text,
      type: input.type,
      priority: input.priority,
      weeklyTarget: input.weeklyTarget,
      dueOn: input.dueOn,
      stages: input.stages ? finaliseStages(input.stages) : null,
    })
    .returning({ id: t.goals.id });
  return { ok: true, data: { id: row.id } };
}

export async function updateGoal(tx: Tx, id: string, raw: GoalInput): Promise<Result<{ stages: Stage[] | null }>> {
  const parsed = goalSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details.", String(parsed.error.issues[0]?.path[0] ?? ""));
  const input = parsed.data;
  const [current] = await tx.select().from(t.goals).where(eq(t.goals.id, id));
  if (!current) return fail("This goal no longer exists.");
  const space = await getSpace(tx, input.spaceId);
  if (!space || space.archivedAt) return fail("Choose one of your Spaces.", "spaceId");
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(t.goalLinks).where(eq(t.goalLinks.goalId, id));
  if (input.spaceId !== current.spaceId && n > 0) return fail("Goals with people in the pipeline can't move to another Space.", "spaceId");

  const stages = input.stages ? finaliseStages(input.stages) : null;
  const effective = stages ?? space.defaults.stages;
  const stranded = await strandedBy(tx, id, effective);
  if (stranded.length) {
    const old = stagesOf(current.stages, space.defaults.stages).stages;
    const labels = stranded.map((u) => `"${old.find((s) => s.key === u.stage)?.label ?? u.stage}"`);
    const people = stranded.reduce((a, u) => a + u.n, 0);
    return fail(`${people === 1 ? "1 person is" : `${people} people are`} at ${labels.join(" and ")}. Move them to another stage before removing it.`, "stages");
  }
  await tx
    .update(t.goals)
    .set({ spaceId: input.spaceId, text: input.text, type: input.type, priority: input.priority, weeklyTarget: input.weeklyTarget, dueOn: input.dueOn, stages })
    .where(eq(t.goals.id, id));
  return { ok: true, data: { stages } };
}

export async function setGoalState(tx: Tx, id: string, state: { active?: boolean; archived?: boolean }) {
  await tx
    .update(t.goals)
    .set({
      ...(state.active !== undefined ? { active: state.active } : {}),
      ...(state.archived !== undefined ? { archivedAt: state.archived ? new Date() : null } : {}),
    })
    .where(eq(t.goals.id, id));
}

/** Deleting a goal removes its pipeline. Rooms tied to it stay, untied. */
export async function deleteGoal(tx: Tx, id: string) {
  await tx.delete(t.goals).where(eq(t.goals.id, id));
}

async function goalWithStages(tx: Tx, goalId: string) {
  if (!isUuid(goalId)) return null;
  const [g] = await tx.select().from(t.goals).where(eq(t.goals.id, goalId));
  if (!g) return null;
  const space = await getSpace(tx, g.spaceId);
  return space ? { goal: g, stages: stagesOf(g.stages, space.defaults.stages).stages } : null;
}

/**
 * Adds people to a goal's pipeline. Only an explicit action does this (brief §2, bug 8). Being
 * put on a goal also counts as sorting them, so they leave the import queue (TECH_PLAN §4.3a).
 */
export async function linkPeople(tx: Tx, userId: string, goalId: string, personIds: string[], stage?: string): Promise<Result<{ added: number; skipped: string[] }>> {
  const g = await goalWithStages(tx, goalId);
  if (!g) return fail("This goal no longer exists.");
  const at = stage ?? firstOpenStage(g.stages).key;
  if (!g.stages.some((s) => s.key === at)) return fail("Choose one of this goal's stages.", "stage");
  let added = 0;
  const skipped: string[] = [];
  for (const personId of [...new Set(personIds)]) {
    const r = await guarded(tx, (sp) => sp.insert(t.goalLinks).values({ userId, goalId, personId, stage: at }).onConflictDoNothing().returning({ id: t.goalLinks.id }));
    if (!r.ok) {
      skipped.push(personId);
      continue;
    }
    if (r.value.length) added++;
  }
  if (added) {
    await tx
      .update(t.personSpaces)
      .set({ triageState: "done" })
      .where(and(inArray(t.personSpaces.personId, personIds), eq(t.personSpaces.spaceId, g.goal.spaceId), eq(t.personSpaces.triageState, "pending")));
  }
  if (!added && skipped.length) return fail(skipped.length === 1 ? "They're not in this goal's Space. Add them to it first." : "None of them are in this goal's Space.");
  return { ok: true, data: { added, skipped } };
}

export async function moveStage(tx: Tx, linkId: string, stage: string): Promise<Result<null>> {
  const [link] = await tx.select({ goalId: t.goalLinks.goalId, stage: t.goalLinks.stage }).from(t.goalLinks).where(eq(t.goalLinks.id, linkId));
  if (!link) return fail("They're no longer on this goal.");
  const g = await goalWithStages(tx, link.goalId);
  if (!g || !g.stages.some((s) => s.key === stage)) return fail("Choose one of this goal's stages.");
  if (link.stage !== stage) await tx.update(t.goalLinks).set({ stage, updatedAt: new Date() }).where(eq(t.goalLinks.id, linkId));
  return { ok: true, data: null };
}

export async function setLinkNote(tx: Tx, linkId: string, note: string) {
  await tx.update(t.goalLinks).set({ note: note || null }).where(eq(t.goalLinks.id, linkId));
}

export async function unlinkPerson(tx: Tx, linkId: string) {
  const [row] = await tx.delete(t.goalLinks).where(eq(t.goalLinks.id, linkId)).returning();
  return row ?? null;
}

/** Puts a removed link back as it was (Undo). History restarts from its current stage. */
export async function restoreLink(tx: Tx, userId: string, link: { goalId: string; personId: string; stage: string; note: string | null }) {
  await tx.insert(t.goalLinks).values({ userId, ...link }).onConflictDoNothing();
}

/** Active goals a person could join: in one of their Spaces, and not already on. */
export async function goalOptionsForPerson(tx: Tx, personId: string) {
  return tx
    .select({ id: t.goals.id, text: t.goals.text, spaceId: t.goals.spaceId, spaceName: t.spaces.name })
    .from(t.goals)
    .innerJoin(t.spaces, eq(t.spaces.id, t.goals.spaceId))
    .innerJoin(t.personSpaces, and(eq(t.personSpaces.spaceId, t.goals.spaceId), eq(t.personSpaces.personId, personId)))
    .where(
      and(
        isNull(t.goals.archivedAt),
        eq(t.goals.active, true),
        isNull(t.spaces.archivedAt),
        sql`not exists (select 1 from goal_links gl where gl.goal_id = ${t.goals.id} and gl.person_id = ${personId})`,
      ),
    )
    .orderBy(asc(t.spaces.position), asc(t.goals.priority), asc(t.goals.text));
}
