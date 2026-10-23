"use server";

import { refresh } from "next/cache";
import { todayIn } from "@/domain/dates";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { loadExampleData, removeExampleData } from "@/server/seed/example";
import * as t from "@/server/db/schema";

export async function loadExamplesAction() {
  const user = await requireUser();
  await db.withUser(user.id, async (tx) => {
    const [profile] = await tx.select({ tz: t.profiles.timezone }).from(t.profiles);
    await loadExampleData(tx, user.id, todayIn(profile?.tz ?? "Africa/Lagos"));
  });
  refresh();
}

export async function removeExamplesAction() {
  const user = await requireUser();
  await db.withUser(user.id, removeExampleData);
  refresh();
}
