"use server";

import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { roomRoles, type RoomDebriefInput, type RoomInput, type RoomRole } from "@/contracts/rooms";
import type { FormState } from "@/features/forms";
import { autoPrepRoom, autoResearch } from "@/server/ai/auto-research";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { saveRoomDebrief, skipRoomSession } from "@/server/repos/debrief";
import { createGoal } from "@/server/repos/goals";
import { attachPrep, loadPlan, matchGoal } from "@/server/repos/prep";
import { createRoom, deleteRoom, linkPerson, restoreRoom, setAttendance, unlinkPerson, updateRoom } from "@/server/repos/rooms";
import { userContext } from "@/server/user-context";

const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function saveRoomAction(roomId: string | null, input: RoomInput, prepId?: string | null): Promise<FormState & { id?: string }> {
  const user = await requireUser();
  const r = await db.withUser(user.id, async (tx) => {
    if (roomId) return updateRoom(tx, id.parse(roomId), input).then((x) => (x.ok ? { ok: true as const, data: { id: roomId } } : x));
    const created = await createRoom(tx, user.id, input);
    // "Find details" already researched it: that look-up becomes the new room's prep.
    if (created.ok && prepId) await attachPrep(tx, id.parse(prepId), created.data.id);
    return created;
  });
  // Added without "Find details": prepare it in the background instead.
  if (r.ok && !roomId && !prepId) await autoPrepRoom(user.id, { id: r.data.id, spaceId: input.spaceId, title: input.title, kind: input.kind ?? "meetup" });
  if (!r.ok) return r.field ? { fieldErrors: { [r.field]: r.message } } : { message: r.message };
  refresh();
  return { ok: true, id: r.data.id };
}

export async function deleteRoomAction(roomId: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => deleteRoom(tx, id.parse(roomId)));
}

export async function restoreRoomAction(roomId: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => restoreRoom(tx, id.parse(roomId)));
  refresh();
}

export async function setAttendanceAction(roomId: string, on: string, attended: boolean | null): Promise<FormState> {
  const user = await requireUser();
  const r = await db.withUser(user.id, (tx) => setAttendance(tx, user.id, id.parse(roomId), date.parse(on), attended));
  if (!r.ok) return { message: r.message };
  refresh();
  return { ok: true };
}

export async function linkPersonAction(roomId: string, personId: string, role: RoomRole): Promise<FormState> {
  const user = await requireUser();
  const r = await db.withUser(user.id, (tx) => linkPerson(tx, user.id, id.parse(roomId), id.parse(personId), z.enum(roomRoles).parse(role)));
  if (!r.ok) return { message: r.message };
  refresh();
  return { ok: true };
}

export async function unlinkPersonAction(roomId: string, personId: string, role: RoomRole) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => unlinkPerson(tx, id.parse(roomId), id.parse(personId), z.enum(roomRoles).parse(role)));
  refresh();
}

export async function saveRoomDebriefAction(input: RoomDebriefInput): Promise<FormState & { people?: number }> {
  const user = await requireUser();
  const r = await db.withUser(user.id, async (tx) => saveRoomDebrief(tx, user.id, input, (await userContext(tx)).today));
  if (!r.ok) return { message: r.message };
  for (const personId of r.data.created) await autoResearch(user.id, personId, r.data.spaceId);
  // Today's card and the room's people both change; this also refreshes pages visited before.
  revalidatePath("/today");
  revalidatePath(`/rooms/${input.eventId}`);
  return { ok: true, people: r.data.people };
}

export async function skipRoomSessionAction(roomId: string, on: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => skipRoomSession(tx, user.id, id.parse(roomId), date.parse(on)));
  revalidatePath("/today");
  revalidatePath(`/rooms/${roomId}`);
}

/** What "Find details" found about an event, to fill in the Add a room form. */
export async function roomDetailsAction(searchId: string) {
  const user = await requireUser();
  const plan = await db.withUser(user.id, (tx) => loadPlan(tx, id.parse(searchId)));
  if (!plan) return null;
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

/** A goal made from the room form ("+ New goal…"), so you don't have to leave it. */
export async function quickGoalAction(spaceId: string, text: string): Promise<{ id?: string; text?: string; message?: string }> {
  const user = await requireUser();
  const r = await db.withUser(user.id, (tx) => createGoal(tx, user.id, { text: z.string().trim().min(1, "Write the goal.").max(140).parse(text), spaceId: id.parse(spaceId), type: "other", priority: 2, weeklyTarget: 3, stages: null }));
  if (!r.ok) return { message: r.message };
  return { id: r.data.id, text: text.trim() };
}
