"use server";

import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { roomRoles, type RoomDebriefInput, type RoomInput, type RoomRole } from "@/contracts/rooms";
import type { FormState } from "@/features/forms";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { saveRoomDebrief, skipRoomSession } from "@/server/repos/debrief";
import { createRoom, deleteRoom, linkPerson, restoreRoom, setAttendance, unlinkPerson, updateRoom } from "@/server/repos/rooms";
import { userContext } from "@/server/user-context";

const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function saveRoomAction(roomId: string | null, input: RoomInput): Promise<FormState & { id?: string }> {
  const user = await requireUser();
  const r = await db.withUser(user.id, (tx) => (roomId ? updateRoom(tx, id.parse(roomId), input).then((x) => (x.ok ? { ok: true as const, data: { id: roomId } } : x)) : createRoom(tx, user.id, input)));
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
