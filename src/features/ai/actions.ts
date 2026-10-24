"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { draftMessage, importChat, readCard } from "@/server/ai/features";
import { AiLimitError } from "@/server/ai/limits";
import { draftPurposes } from "@/server/ai/prompts/writing";
import { AiError } from "@/server/ai/run";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { aiJobSchema } from "@/server/jobs/ai-jobs";
import { enqueueAiJob } from "@/server/jobs/enqueue";
import { logTouch } from "@/server/repos/people";
import { acceptSuggestion, discardSuggestion } from "@/server/repos/suggestions";
import { userContext } from "@/server/user-context";

const id = z.string().uuid();
const message = (e: unknown) => (e instanceof AiError || e instanceof AiLimitError ? e.message : null);

export async function startAiJobAction(input: unknown): Promise<{ jobId?: string; message?: string }> {
  const user = await requireUser();
  const parsed = aiJobSchema.safeParse(input);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Check the details." };
  try {
    return { jobId: await enqueueAiJob(user.id, parsed.data) };
  } catch (e) {
    const m = message(e);
    if (m) return { message: m };
    throw e;
  }
}

export async function draftAction(personId: string, spaceId: string, purpose: string): Promise<{ text?: string; phone?: string | null; email?: string | null; message?: string }> {
  const user = await requireUser();
  try {
    return await draftMessage({}, user.id, { personId: id.parse(personId), spaceId: id.parse(spaceId), purpose: z.enum(draftPurposes).parse(purpose) });
  } catch (e) {
    const m = message(e);
    if (m) return { message: m };
    throw e;
  }
}

/** After sending a draft from WhatsApp or email: log it as a touch. */
export async function logSentDraftAction(personId: string, spaceId: string, text: string) {
  const user = await requireUser();
  await db.withUser(user.id, async (tx) => {
    const ctx = await userContext(tx);
    return logTouch(tx, user.id, { id: randomUUID(), personId: id.parse(personId), spaceId: id.parse(spaceId), occurredOn: ctx.today, type: "message", summary: z.string().max(2000).parse(text).slice(0, 300) });
  });
  refresh();
}

const MAX_IMAGE = 4 * 1024 * 1024;
export async function readCardAction(form: FormData): Promise<{ fields?: Record<string, string>; message?: string }> {
  const user = await requireUser();
  const file = form.get("image");
  if (!(file instanceof File) || !file.size) return { message: "Choose a photo of the card." };
  if (file.size > MAX_IMAGE) return { message: "That photo is too large. Try again; it's shrunk before upload." };
  const type = z.enum(["image/jpeg", "image/png", "image/webp"]).safeParse(file.type);
  if (!type.success) return { message: "Use a JPEG, PNG or WebP photo." };
  try {
    const region = await db.withUser(user.id, async (tx) => (await userContext(tx)).region);
    const r = await readCard({}, user.id, { mediaType: type.data, base64: Buffer.from(await file.arrayBuffer()).toString("base64"), region });
    return { fields: Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === "string" && v)) as Record<string, string> };
  } catch (e) {
    const m = message(e);
    if (m) return { message: m };
    throw e;
  }
}

export async function importChatAction(input: { spaceId: string; personId: string; transcript: string; me: string }): Promise<{ summary?: string; suggestions?: number; message?: string }> {
  const user = await requireUser();
  const transcript = z.string().trim().min(20, "Paste more of the chat.").max(500_000).safeParse(input.transcript);
  if (!transcript.success) return { message: transcript.error.issues[0].message };
  try {
    const today = await db.withUser(user.id, async (tx) => (await userContext(tx)).today);
    const r = await importChat({}, user.id, { spaceId: id.parse(input.spaceId), personId: id.parse(input.personId), transcript: transcript.data, me: z.string().max(80).parse(input.me ?? ""), today });
    refresh();
    return r;
  } catch (e) {
    const m = message(e);
    if (m) return { message: m };
    throw e;
  }
}

export async function acceptSuggestionAction(suggestionId: string, edited?: string): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const r = await db.withUser(user.id, (tx) => acceptSuggestion(tx, user.id, id.parse(suggestionId), edited === undefined ? undefined : z.string().max(2000).parse(edited)));
  refresh();
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}

export async function discardSuggestionAction(suggestionId: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => discardSuggestion(tx, id.parse(suggestionId)));
  refresh();
}

export async function deleteResearchAction(dossierId: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => tx.delete(t.dossiers).where(eq(t.dossiers.id, id.parse(dossierId))));
  refresh();
}

/** Hides one suggested room from a saved list. */
export async function hideRoomIdeaAction(searchId: string, itemId: string) {
  const user = await requireUser();
  await db.withUser(user.id, async (tx) => {
    const [s] = await tx.select({ result: t.searches.result }).from(t.searches).where(and(eq(t.searches.id, id.parse(searchId)), eq(t.searches.type, "radar")));
    if (!s) return;
    const result = s.result as { items: { id: string }[] };
    await tx.update(t.searches).set({ result: { ...result, items: result.items.filter((i) => i.id !== itemId) } }).where(eq(t.searches.id, searchId));
  });
  refresh();
}
