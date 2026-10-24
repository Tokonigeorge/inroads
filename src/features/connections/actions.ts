"use server";

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { aboutYouSchema, icsLinkSchema, pickedContactsSchema, triageDecisionsSchema } from "@/contracts/connections";
import { fieldErrors, type FormState } from "@/features/forms";
import { mapPickedContacts } from "@/importers/contact-picker";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { applyContacts } from "@/server/import/contacts";
import { finishImport, startImport } from "@/server/import/imports";
import { acceptSuggestedSort, applyTriage, computeTriageSuggestions, undoImport } from "@/server/import/triage";
import { revokeGoogle } from "@/server/integrations/google";
import { IcsUrlError, normaliseIcsUrl } from "@/server/integrations/ics-url";
import { enqueueSync } from "@/server/jobs/enqueue";
import { ownsConnection } from "@/server/repos/connections";
import { listSpaces } from "@/server/repos/spaces";
import { connectionsStore } from "@/server/system/connections";
import { userContext } from "@/server/user-context";

const idSchema = z.string().uuid();

export async function syncNowAction(connectionId: string): Promise<{ jobId?: string; message?: string }> {
  const user = await requireUser();
  const conn = await db.withUser(user.id, (tx) => ownsConnection(tx, idSchema.parse(connectionId)));
  if (!conn) return { message: "That account isn't connected any more." };
  return { jobId: await enqueueSync(user.id, conn.id, conn.provider) };
}

/** Forgets the account's tokens (and asks Google to revoke them). Imported people and rooms stay. */
export async function disconnectAction(connectionId: string) {
  const user = await requireUser();
  const conn = await db.withUser(user.id, (tx) => ownsConnection(tx, idSchema.parse(connectionId)));
  if (!conn) return;
  const store = connectionsStore();
  if (conn.provider === "google") {
    const full = await store.get(conn.id);
    const token = full?.tokens?.refresh_token ?? full?.tokens?.access_token;
    if (token) await revokeGoogle(fetch, token);
  }
  await store.disconnect(conn.id, user.id);
  refresh();
}

export type IcsFormState = FormState & { jobId?: string };

export async function addIcsLinkAction(_prev: IcsFormState, formData: FormData): Promise<IcsFormState> {
  const user = await requireUser();
  const parsed = icsLinkSchema.safeParse({ url: formData.get("url"), spaceId: formData.get("spaceId") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  let url: URL;
  try {
    url = normaliseIcsUrl(parsed.data.url);
  } catch (e) {
    return { fieldErrors: { url: e instanceof IcsUrlError ? e.message : "That link didn't work." } };
  }
  const spaces = await db.withUser(user.id, (tx) => listSpaces(tx));
  if (!spaces.some((s) => s.id === parsed.data.spaceId)) return { fieldErrors: { spaceId: "Choose a Space." } };
  // The link itself is a secret (anyone with it can read the calendar), so it's stored encrypted
  // and only a host plus a short fingerprint is kept in the clear, to tell links apart.
  const label = `${url.host}#${createHash("sha256").update(url.toString()).digest("hex").slice(0, 8)}`;
  const connectionId = await connectionsStore().upsert({
    userId: user.id,
    provider: "apple_ics",
    accountEmail: label,
    scopes: [],
    icsUrl: url.toString(),
    spaceId: parsed.data.spaceId,
  });
  const jobId = await enqueueSync(user.id, connectionId, "apple_ics");
  refresh();
  return { ok: true, jobId, savedAt: Date.now() };
}

export async function importPickedContactsAction(input: unknown): Promise<{ ok: boolean; message?: string; added?: number; updated?: number }> {
  const user = await requireUser();
  const parsed = pickedContactsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Those contacts couldn't be read." };
  const r = await db.withUser(user.id, async (tx) => {
    const spaces = await listSpaces(tx);
    if (!spaces.some((s) => s.id === parsed.data.spaceId)) return null;
    const ctx = await userContext(tx);
    const contacts = mapPickedContacts(parsed.data.contacts, ctx.region);
    const imp = await startImport(tx, { userId: user.id, spaceId: parsed.data.spaceId, type: "contact_picker" });
    const summary = await applyContacts(tx, { userId: user.id, importId: imp.id, spaceId: parsed.data.spaceId, today: ctx.today, source: "phone" }, contacts);
    await computeTriageSuggestions(tx, { today: ctx.today, importId: imp.id });
    await finishImport(tx, imp.id, { contacts: summary });
    return summary;
  });
  if (!r) return { ok: false, message: "Choose a Space." };
  refresh();
  return { ok: true, added: r.added, updated: r.updated };
}

export async function undoImportAction(importId: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => undoImport(tx, idSchema.parse(importId)));
  refresh();
}

/* ---------------- triage ---------------- */

export async function acceptSuggestedSortAction(spaceId: string | null) {
  const user = await requireUser();
  const result = await db.withUser(user.id, (tx) => acceptSuggestedSort(tx, spaceId ? idSchema.parse(spaceId) : null));
  refresh();
  return result;
}

export async function decideTriageAction(decisions: unknown) {
  const user = await requireUser();
  const parsed = triageDecisionsSchema.parse(decisions);
  await db.withUser(user.id, (tx) => applyTriage(tx, parsed));
  refresh();
}

/* ---------------- onboarding ---------------- */

export async function saveAboutYouAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = aboutYouSchema.safeParse({ name: formData.get("name"), timezone: formData.get("timezone"), region: formData.get("region") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  await db.withUser(user.id, (tx) =>
    tx
      .update(t.profiles)
      .set({ name: parsed.data.name, timezone: parsed.data.timezone, defaultRegion: parsed.data.region })
      .where(eq(t.profiles.userId, user.id)),
  );
  redirect("/onboarding?step=connect");
}

export async function finishOnboardingAction(next: string = "/today") {
  const user = await requireUser();
  await db.withUser(user.id, async (tx) => {
    const [p] = await tx.select({ s: t.profiles.onboardingState }).from(t.profiles).where(eq(t.profiles.userId, user.id));
    await tx
      .update(t.profiles)
      .set({ onboardingState: { ...((p?.s ?? {}) as object), completedAt: new Date().toISOString() } })
      .where(eq(t.profiles.userId, user.id));
  });
  redirect(next === "/people/triage" ? "/people/triage" : "/today");
}
