"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { GoalInput } from "@/contracts/goals";
import type { Stage } from "@/contracts/spaces";
import type { FormState } from "@/features/forms";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { createGoal, deleteGoal, linkPeople, moveStage, restoreLink, setGoalState, setLinkNote, unlinkPerson, updateGoal } from "@/server/repos/goals";
import { createPerson } from "@/server/repos/people";
import * as t from "@/server/db/schema";
import { userContext } from "@/server/user-context";

const id = z.string().uuid();

export async function saveGoalAction(goalId: string | null, input: GoalInput): Promise<FormState & { id?: string; stages?: Stage[] | null }> {
  const user = await requireUser();
  const r = await db.withUser(user.id, async (tx) => {
    if (!goalId) return createGoal(tx, user.id, input);
    const u = await updateGoal(tx, id.parse(goalId), input);
    return u.ok ? { ok: true as const, data: { id: goalId, stages: u.data.stages } } : u;
  });
  if (!r.ok) return r.field ? { fieldErrors: { [r.field]: r.message } } : { message: r.message };
  refresh();
  return { ok: true, id: r.data.id, savedAt: Date.now(), stages: "stages" in r.data ? (r.data.stages as Stage[] | null) : undefined };
}

export async function setGoalStateAction(goalId: string, state: { active?: boolean; archived?: boolean }) {
  const user = await requireUser();
  const parsed = z.object({ active: z.boolean().optional(), archived: z.boolean().optional() }).parse(state);
  await db.withUser(user.id, (tx) => setGoalState(tx, id.parse(goalId), parsed));
  refresh();
}

export async function deleteGoalAction(goalId: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => deleteGoal(tx, id.parse(goalId)));
  redirect("/goals");
}

export async function addPeopleToGoalAction(goalId: string, personIds: string[], stage?: string): Promise<FormState & { added?: number }> {
  const user = await requireUser();
  const r = await db.withUser(user.id, (tx) => linkPeople(tx, user.id, id.parse(goalId), z.array(id).min(1).max(200).parse(personIds), stage ? z.string().max(40).parse(stage) : undefined));
  if (!r.ok) return { message: r.message };
  refresh();
  return { ok: true, added: r.data.added };
}

/** Someone you want to meet but haven't saved yet: create them in the goal's Space, then add them. */
export async function addNewPersonToGoalAction(goalId: string, name: string, stage?: string): Promise<FormState & { personId?: string }> {
  const user = await requireUser();
  const gid = id.parse(goalId);
  const r = await db.withUser(user.id, async (tx) => {
    const [goal] = await tx.select({ spaceId: t.goals.spaceId }).from(t.goals).where(eq(t.goals.id, gid));
    if (!goal) return { ok: false as const, message: "This goal no longer exists." };
    const ctx = await userContext(tx);
    const personId = randomUUID();
    const created = await createPerson(tx, user.id, { id: personId, identity: { name }, membership: { spaceId: goal.spaceId } }, ctx.today);
    if (!created.ok) return created;
    const linked = await linkPeople(tx, user.id, gid, [personId], stage);
    return linked.ok ? { ok: true as const, data: { personId } } : linked;
  });
  if (!r.ok) return { message: r.message };
  refresh();
  return { ok: true, personId: r.data.personId };
}

export async function moveStageAction(linkId: string, stage: string): Promise<FormState> {
  const user = await requireUser();
  const r = await db.withUser(user.id, (tx) => moveStage(tx, id.parse(linkId), z.string().min(1).max(40).parse(stage)));
  if (!r.ok) return { message: r.message };
  refresh();
  return { ok: true };
}

export async function saveLinkNoteAction(linkId: string, note: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => setLinkNote(tx, id.parse(linkId), z.string().trim().max(500).parse(note)));
  refresh();
}

export type RemovedLink = { goalId: string; personId: string; stage: string; note: string | null };

export async function removeFromGoalAction(linkId: string): Promise<RemovedLink | null> {
  const user = await requireUser();
  const row = await db.withUser(user.id, (tx) => unlinkPerson(tx, id.parse(linkId)));
  refresh();
  return row ? { goalId: row.goalId, personId: row.personId, stage: row.stage, note: row.note } : null;
}

export async function restoreLinkAction(link: RemovedLink) {
  const user = await requireUser();
  const parsed = z.object({ goalId: id, personId: id, stage: z.string().min(1).max(40), note: z.string().max(500).nullable() }).parse(link);
  await db.withUser(user.id, (tx) => restoreLink(tx, user.id, parsed));
  refresh();
}
