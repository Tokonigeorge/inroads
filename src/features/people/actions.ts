"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { type IntroRequestInput, type MembershipInput, type PersonIdentityInput } from "@/contracts/people";
import type { FormState } from "@/features/forms";
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
