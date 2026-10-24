"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { type IntroRequestInput, type MembershipInput, type PersonIdentityInput } from "@/contracts/people";
import { fieldErrors, type FormState } from "@/features/forms";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import {
  deletePerson,
  deletePromise,
  deleteTouch,
  removeFromSpace,
  restorePerson,
  saveMembership,
  setPersonArchived,
  updatePersonIdentity,
} from "@/server/repos/people";
import { requestIntro } from "@/server/repos/intros";
import { askNetwork, type AskResult } from "@/server/search/ask";
import { userContext } from "@/server/user-context";

const id = z.string().uuid();

function toState(r: { ok: true } | { ok: false; message: string; field?: string }): FormState {
  if (r.ok) return { ok: true, savedAt: Date.now() };
  return r.field ? { fieldErrors: { [r.field]: r.message } } : { message: r.message };
}

export async function updateIdentityAction(personId: string, input: PersonIdentityInput): Promise<FormState> {
  const user = await requireUser();
  const r = await db.withUser(user.id, (tx) => updatePersonIdentity(tx, id.parse(personId), input));
  if (r.ok) refresh();
  return toState(r);
}

export async function saveMembershipAction(personId: string, input: MembershipInput): Promise<FormState> {
  const user = await requireUser();
  const r = await db.withUser(user.id, async (tx) => saveMembership(tx, user.id, id.parse(personId), input, (await userContext(tx)).today));
  if (r.ok) refresh();
  return toState(r);
}

export async function removeFromSpaceAction(personId: string, spaceId: string): Promise<FormState> {
  const user = await requireUser();
  const r = await db.withUser(user.id, (tx) => removeFromSpace(tx, id.parse(personId), id.parse(spaceId)));
  if (r.ok) refresh();
  return toState(r);
}

export async function setArchivedAction(personId: string, archived: boolean) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => setPersonArchived(tx, id.parse(personId), archived));
  refresh();
}

export async function deletePersonAction(personId: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => deletePerson(tx, id.parse(personId)));
}

export async function restorePersonAction(personId: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => restorePerson(tx, id.parse(personId)));
  refresh();
}

export async function deleteTouchAction(touchId: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => deleteTouch(tx, id.parse(touchId)));
  refresh();
}

export async function deletePromiseAction(promiseId: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => deletePromise(tx, id.parse(promiseId)));
  refresh();
}

export async function requestIntroAction(input: IntroRequestInput): Promise<FormState> {
  const user = await requireUser();
  const r = await db.withUser(user.id, async (tx) => requestIntro(tx, user.id, input, (await userContext(tx)).today));
  if (!r.ok) return { message: r.message };
  refresh();
  return { ok: true };
}

const askSchema = z.object({ spaceId: z.string().uuid("Choose a Space."), question: z.string().trim().min(3, "Ask a question, like “who do I know in fintech in Accra?”").max(300, "Keep the question under 300 characters.") });

export type AskState = FormState & { result?: AskResult; question?: string };

/** Ask your network: one Space at a time (DECISIONS #1). */
export async function askNetworkAction(_prev: AskState, formData: FormData): Promise<AskState> {
  const user = await requireUser();
  const parsed = askSchema.safeParse({ spaceId: formData.get("spaceId"), question: formData.get("question") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const result = await db.withUser(user.id, (tx) => askNetwork(tx, {}, user.id, parsed.data));
  return { ok: true, result, question: parsed.data.question };
}
