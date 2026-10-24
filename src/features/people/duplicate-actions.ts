"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { dismissDuplicate, mergeFields, mergePeople, undoMerge } from "@/server/repos/merge";

const id = z.string().uuid();
const choicesSchema = z.object(Object.fromEntries(mergeFields.map((f) => [f, z.enum(["keep", "other"]).optional()]))).strict();

export async function mergeAction(input: { suggestionId: string; keepId: string; otherId: string; choices: Record<string, string> }): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const r = await db.withUser(user.id, (tx) =>
    mergePeople(tx, user.id, { suggestionId: id.parse(input.suggestionId), keepId: id.parse(input.keepId), otherId: id.parse(input.otherId), choices: choicesSchema.parse(input.choices) }),
  );
  if (!r.ok) return { ok: false, message: r.message };
  refresh();
  return { ok: true };
}

export async function keepBothAction(suggestionId: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => dismissDuplicate(tx, id.parse(suggestionId)));
  refresh();
}

export async function undoMergeAction(suggestionId: string): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const r = await db.withUser(user.id, (tx) => undoMerge(tx, id.parse(suggestionId)));
  refresh();
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}
