"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { clearNudgeState, setNudgeState } from "@/server/repos/nudges";

const keySchema = z.string().regex(/^[a-z]+:[A-Za-z0-9:-]{1,200}$/);

export async function snoozeNudgeAction(key: string, days: number) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => setNudgeState(tx, user.id, keySchema.parse(key), { type: "snooze", days: z.number().int().min(1).max(90).parse(days) }));
  refresh();
}

export async function dismissNudgeAction(key: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => setNudgeState(tx, user.id, keySchema.parse(key), { type: "dismiss" }));
  refresh();
}

export async function undoNudgeAction(key: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => clearNudgeState(tx, keySchema.parse(key)));
  refresh();
}
