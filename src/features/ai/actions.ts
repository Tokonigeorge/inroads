"use server";

import { randomUUID } from "node:crypto";
import { firstIssue } from "@/contracts/issues";
import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { addDays } from "@/domain/dates";
import { draftMessage, importChat, readCard } from "@/server/ai/features";
import { autoResearch } from "@/server/ai/auto-research";
import { AiLimitError } from "@/server/ai/limits";
import { draftPurposes } from "@/server/ai/prompts/writing";
import { AiError } from "@/server/ai/run";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { aiJobSchema } from "@/server/jobs/ai-jobs";
import { enqueueAiJob } from "@/server/jobs/enqueue";
import { addGoalStep } from "@/server/repos/goal-steps";
import { logTouch } from "@/server/repos/people";
import { keepOpening, keepStakeholder } from "@/server/repos/prep";
import { acceptSuggestion, discardSuggestion, pendingForPerson } from "@/server/repos/suggestions";
import { userContext } from "@/server/user-context";
import type { SuggestionView } from "./suggestion-list";
import { describeSuggestion } from "./suggestion-view";

const id = z.string().uuid();
const message = (e: unknown) => (e instanceof AiError || e instanceof AiLimitError ? e.message : null);

export async function startAiJobAction(input: unknown): Promise<{ jobId?: string; message?: string }> {
  const user = await requireUser();
  const parsed = aiJobSchema.safeParse(input);
  if (!parsed.success) return { message: firstIssue(parsed.error, "Check the details.") };
  try {
    return { jobId: await enqueueAiJob(user.id, parsed.data) };
  } catch (e) {
    const m = message(e);
    if (m) return { message: m };
    throw e;
  }
}

/**
 * "Find event planners…" from a plan's role: a research step on the goal, due in a week, and the
 * web search for people who fit starts straight away. The step keeps what it finds.
 */
export async function addResearchStepAction(goalId: string, text: string): Promise<{ ok: boolean; stepId?: string; jobId?: string | null; message?: string }> {
  const user = await requireUser();
  const r = await db.withUser(user.id, async (tx) => {
    const today = (await userContext(tx)).today;
    return addGoalStep(tx, user.id, { goalId: id.parse(goalId), text: z.string().trim().min(1).max(300).parse(text), dueOn: addDays(today, 7) });
  });
  if (!r.ok) return { ok: false, message: r.message };
  refresh();
  try {
    return { ok: true, stepId: r.data.id, jobId: await enqueueAiJob(user.id, { kind: "find", stepId: r.data.id }) };
  } catch (e) {
    // The step is saved either way; the search can be started from the goal.
    return { ok: true, stepId: r.data.id, jobId: null, message: message(e) ?? undefined };
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
  if (!transcript.success) return { message: firstIssue(transcript.error) };
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

/** What a chat import found for this person, to review in the import sheet (prototype "review" step). */
export async function pendingSuggestionsAction(personId: string): Promise<SuggestionView[]> {
  const user = await requireUser();
  const rows = await db.withUser(user.id, (tx) => pendingForPerson(tx, id.parse(personId)));
  return rows.map(describeSuggestion);
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

/** Save someone a plan named (or reuse your contact), add them to the goal and the room, then research them. */
export async function keepStakeholderAction(searchId: string, index: number, goalId: string | null): Promise<{ ok: boolean; personId?: string; message?: string }> {
  const user = await requireUser();
  const r = await db.withUser(user.id, async (tx) =>
    keepStakeholder(tx, user.id, { searchId: id.parse(searchId), index: z.number().int().min(0).max(20).parse(index), goalId: goalId ? id.parse(goalId) : null }, (await userContext(tx)).today),
  );
  if (!r.ok) return { ok: false, message: r.message };
  if (r.data.created) {
    const [s] = await db.withUser(user.id, (tx) => tx.select({ spaceId: t.searches.spaceId }).from(t.searches).where(eq(t.searches.id, searchId)));
    if (s) await autoResearch(user.id, r.data.personId, s.spaceId);
  }
  refresh();
  return { ok: true, personId: r.data.personId };
}

/** Add a plan's first move as a step on a goal. */
export async function keepOpeningAction(searchId: string, index: number, goalId: string): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const r = await db.withUser(user.id, async (tx) =>
    keepOpening(tx, user.id, { searchId: id.parse(searchId), index: z.number().int().min(0).max(20).parse(index), goalId: id.parse(goalId) }, (await userContext(tx)).today),
  );
  if (!r.ok) return { ok: false, message: r.message };
  refresh();
  return { ok: true };
}
