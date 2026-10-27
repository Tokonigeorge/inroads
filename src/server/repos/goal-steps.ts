import "server-only";
import { firstIssue } from "@/contracts/issues";
import { and, asc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { isoDateSchema } from "@/contracts/people";
import type { IsoDate } from "@/domain/dates";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import type { Result } from "./spaces";

const fail = (message: string, field?: string): Result<never> => ({ ok: false, message, field });

export const goalStepSchema = z.object({
  goalId: z.string().uuid(),
  text: z.string().trim().min(1, "Write the step.").max(300, "Keep it under 300 characters."),
  dueOn: z
    .union([isoDateSchema, z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
});
export type GoalStepInput = z.input<typeof goalStepSchema>;

export type GoalStep = { id: string; text: string; dueOn: string | null; doneAt: Date | null; fromPrep: boolean };

export async function addGoalStep(tx: Tx, userId: string, raw: GoalStepInput, searchId: string | null = null): Promise<Result<{ id: string }>> {
  const input = goalStepSchema.safeParse(raw);
  if (!input.success) return fail(firstIssue(input.error, "Check the step."), String(input.error.issues[0]?.path.at(-1) ?? ""));
  const [goal] = await tx
    .select({ id: t.goals.id })
    .from(t.goals)
    .where(and(eq(t.goals.id, input.data.goalId), isNull(t.goals.archivedAt)));
  if (!goal) return fail("This goal no longer exists.");
  const [row] = await tx.insert(t.goalSteps).values({ userId, goalId: goal.id, text: input.data.text, dueOn: input.data.dueOn, searchId }).returning({ id: t.goalSteps.id });
  return { ok: true, data: { id: row.id } };
}

export async function setGoalStepDone(tx: Tx, id: string, done: boolean) {
  await tx
    .update(t.goalSteps)
    .set({ doneAt: done ? new Date() : null })
    .where(eq(t.goalSteps.id, id));
}

export async function deleteGoalStep(tx: Tx, id: string) {
  await tx.delete(t.goalSteps).where(eq(t.goalSteps.id, id));
}

/** Open steps first (soonest due first, undated last), then the five most recently done. */
export async function listGoalSteps(tx: Tx, goalId: string): Promise<GoalStep[]> {
  const cols = { id: t.goalSteps.id, text: t.goalSteps.text, dueOn: t.goalSteps.dueOn, doneAt: t.goalSteps.doneAt, searchId: t.goalSteps.searchId };
  const open = await tx
    .select(cols)
    .from(t.goalSteps)
    .where(and(eq(t.goalSteps.goalId, goalId), isNull(t.goalSteps.doneAt)))
    .orderBy(sql`${t.goalSteps.dueOn} asc nulls last`, asc(t.goalSteps.createdAt));
  const done = await tx
    .select(cols)
    .from(t.goalSteps)
    .where(and(eq(t.goalSteps.goalId, goalId), isNotNull(t.goalSteps.doneAt)))
    .orderBy(sql`${t.goalSteps.doneAt} desc`)
    .limit(5);
  return [...open, ...done].map(({ searchId, ...s }) => ({ ...s, fromPrep: Boolean(searchId) }));
}

/** Steps due by `upTo` on active goals, for Today. Optionally one Space. */
export async function dueGoalSteps(tx: Tx, upTo: IsoDate, spaceId: string | null) {
  return tx
    .select({ id: t.goalSteps.id, text: t.goalSteps.text, dueOn: t.goalSteps.dueOn, goalId: t.goals.id, goal: t.goals.text })
    .from(t.goalSteps)
    .innerJoin(t.goals, eq(t.goals.id, t.goalSteps.goalId))
    .where(
      and(
        isNull(t.goalSteps.doneAt),
        isNotNull(t.goalSteps.dueOn),
        lte(t.goalSteps.dueOn, upTo),
        isNull(t.goals.archivedAt),
        eq(t.goals.active, true),
        spaceId ? eq(t.goals.spaceId, spaceId) : undefined,
      ),
    )
    .orderBy(asc(t.goalSteps.dueOn))
    .limit(8);
}
