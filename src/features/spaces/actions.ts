"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSpaceSchema, updateSpaceSchema, type Stage } from "@/contracts/spaces";
import { fieldErrors, type FormState } from "@/features/forms";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { createSpace, deleteSpace, listSpaces, reorderSpaces, setSpaceArchived, updateSpace } from "@/server/repos/spaces";
import { SPACE_COOKIE } from "@/server/space-selection";

const idSchema = z.string().uuid();

/** Switches the Space the lists show. "all" shows every Space side by side. */
export async function selectSpaceAction(spaceId: string | "all") {
  const user = await requireUser();
  const store = await cookies();
  if (spaceId === "all") {
    store.delete(SPACE_COOKIE);
  } else {
    const id = idSchema.parse(spaceId);
    const spaces = await db.withUser(user.id, (tx) => listSpaces(tx));
    if (!spaces.some((s) => s.id === id)) return;
    store.set(SPACE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  refresh();
}

export async function createSpaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = createSpaceSchema.safeParse({ name: formData.get("name"), kind: formData.get("kind") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const result = await db.withUser(user.id, (tx) => createSpace(tx, user.id, parsed.data));
  if (!result.ok) return result.field ? { fieldErrors: { [result.field]: result.message } } : { message: result.message };
  redirect(`/settings/spaces/${result.data.id}?created=1`);
}

export async function updateSpaceAction(
  spaceId: string,
  _prev: FormState & { stages?: Stage[] },
  formData: FormData,
): Promise<FormState & { stages?: Stage[] }> {
  const user = await requireUser();
  const cadence = String(formData.get("cadenceDays") ?? "none");
  let stages: unknown;
  try {
    stages = JSON.parse(String(formData.get("stages") ?? "[]"));
  } catch {
    stages = [];
  }
  const parsed = updateSpaceSchema.safeParse({
    name: formData.get("name"),
    cadenceDays: cadence === "none" ? null : Number(cadence),
    researchMode: formData.get("researchMode"),
    stages,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const result = await db.withUser(user.id, (tx) => updateSpace(tx, idSchema.parse(spaceId), parsed.data));
  if (!result.ok) return result.field ? { fieldErrors: { [result.field]: result.message } } : { message: result.message };
  refresh();
  return { ok: true, savedAt: Date.now(), stages: result.data.defaults.stages };
}

export async function setSpaceArchivedAction(spaceId: string, archived: boolean): Promise<FormState> {
  const user = await requireUser();
  const result = await db.withUser(user.id, (tx) => setSpaceArchived(tx, idSchema.parse(spaceId), archived));
  if (!result.ok) return { message: result.message };
  refresh();
  return { ok: true };
}

export async function deleteSpaceAction(spaceId: string): Promise<FormState> {
  const user = await requireUser();
  const result = await db.withUser(user.id, (tx) => deleteSpace(tx, idSchema.parse(spaceId)));
  if (!result.ok) return { message: result.message };
  redirect("/settings#spaces");
}

export async function moveSpaceAction(spaceId: string, direction: "up" | "down") {
  const user = await requireUser();
  await db.withUser(user.id, async (tx) => {
    const ids = (await listSpaces(tx)).map((s) => s.id);
    const i = ids.indexOf(idSchema.parse(spaceId));
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorderSpaces(tx, ids);
  });
  refresh();
}
