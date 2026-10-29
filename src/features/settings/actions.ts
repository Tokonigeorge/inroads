"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { firstIssue } from "@/contracts/issues";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { goalTypes, type GoalType } from "@/contracts/goals";
import { profileGoalsSchema, profileSchema, type ProfileGoalsInput } from "@/contracts/profile";
import { todayIn } from "@/domain/dates";
import { fieldErrors, type FormState } from "@/features/forms";
import { deleteAccount } from "@/server/account/delete";
import { requireUser } from "@/server/auth";
import { enqueueExport } from "@/server/jobs/enqueue";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { db } from "@/server/db/client";
import { createGoal } from "@/server/repos/goals";
import { loadExampleData, removeExampleData } from "@/server/seed/example";
import { readSelectedSpaceId } from "@/server/space-selection";
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

export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(["name", "headline", "location", "background", "offerings", "aiNotes", "industries", "timezone", "region", "briefTime"].map((k) => [k, formData.get(k) ?? ""])));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { region, ...rest } = parsed.data;
  await db.withUser(user.id, (tx) => tx.update(t.profiles).set({ ...rest, defaultRegion: region }).where(eq(t.profiles.userId, user.id)));
  refresh();
  return { ok: true, savedAt: Date.now() };
}

export async function startExportAction(): Promise<{ jobId: string }> {
  const user = await requireUser();
  return { jobId: await enqueueExport(user.id) };
}

/** Deletes the account after the user types their email. Signs out and lands on the sign-in page. */
export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const typed = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (!user.email || typed !== user.email.toLowerCase()) return { fieldErrors: { confirm: "Type your email exactly as shown to confirm." } };
  try {
    await deleteAccount(user.id);
  } catch (e) {
    console.error("delete account failed", e);
    return { message: "Couldn't finish deleting your account. Try again in a minute." };
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-in?deleted=1");
}

/**
 * Saves the "Profile & goals" sheet in one go. Goal rows with an id update that goal; new rows are
 * created in your Work Space (or the Space you're looking at); rows removed from the sheet are
 * archived, not deleted, so their pipelines aren't lost. Empty rows are ignored.
 */
export async function saveProfileGoalsAction(input: ProfileGoalsInput): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileGoalsSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), message: firstIssue(parsed.error) };
  const { goals, ...profile } = parsed.data;
  const spaceSel = await readSelectedSpaceId();
  const r = await db.withUser(user.id, async (tx) => {
    await tx.update(t.profiles).set(profile).where(eq(t.profiles.userId, user.id));
    const spaces = await tx.select({ id: t.spaces.id, kind: t.spaces.kind }).from(t.spaces).where(isNull(t.spaces.archivedAt)).orderBy(t.spaces.position);
    const home = spaces.find((s) => s.id === spaceSel) ?? spaces.find((s) => s.kind === "work") ?? spaces[0];
    const mine = await tx.select({ id: t.goals.id }).from(t.goals).where(and(isNull(t.goals.archivedAt), eq(t.goals.example, false)));
    const kept = new Set<string>();
    let firstNew: string | undefined;
    for (const g of goals) {
      if (!g.text) continue;
      const type = (goalTypes as readonly string[]).includes(g.type) ? (g.type as GoalType) : "other";
      if (g.id && mine.some((m) => m.id === g.id)) {
        kept.add(g.id);
        await tx.update(t.goals).set({ text: g.text, type, priority: g.priority, weeklyTarget: g.weeklyTarget, active: g.active }).where(eq(t.goals.id, g.id));
      } else {
        if (!home) return { ok: false as const, message: "Create a Space first." };
        const created = await createGoal(tx, user.id, { text: g.text.length < 3 ? `${g.text}…` : g.text, spaceId: home.id, type, priority: g.priority, weeklyTarget: g.weeklyTarget, stages: null });
        if (!created.ok) return created;
        firstNew ??= created.data.id;
        if (!g.active) await tx.update(t.goals).set({ active: false }).where(eq(t.goals.id, created.data.id));
      }
    }
    const removed = mine.filter((m) => !kept.has(m.id)).map((m) => m.id);
    if (removed.length) await tx.update(t.goals).set({ archivedAt: new Date() }).where(inArray(t.goals.id, removed));
    return { ok: true as const, firstNew };
  });
  if (!r.ok) return { message: r.message };
  refresh();
  return { ok: true, savedAt: Date.now(), id: r.firstNew };
}
