"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { profileSchema } from "@/contracts/profile";
import { todayIn } from "@/domain/dates";
import { fieldErrors, type FormState } from "@/features/forms";
import { deleteAccount } from "@/server/account/delete";
import { requireUser } from "@/server/auth";
import { enqueueExport } from "@/server/jobs/enqueue";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(["name", "headline", "location", "background", "offerings", "industries", "timezone", "region", "briefTime"].map((k) => [k, formData.get(k) ?? ""])));
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
