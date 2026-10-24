"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { cancelFileImport, commitFileImport } from "@/server/import/files";
import { listSpaces } from "@/server/repos/spaces";
import { userContext } from "@/server/user-context";

const id = z.string().uuid();

export async function commitImportAction(importId: string, spaceId: string): Promise<{ message: string }> {
  const user = await requireUser();
  const r = await db.withUser(user.id, async (tx) => {
    const spaces = await listSpaces(tx);
    if (!spaces.some((s) => s.id === spaceId)) return "space" as const;
    const [ctx, [profile]] = await Promise.all([userContext(tx), tx.select({ emails: t.profiles.emails }).from(t.profiles)]);
    return commitFileImport(tx, { userId: user.id, importId: id.parse(importId), spaceId, today: ctx.today, meEmails: [...(profile?.emails ?? []), user.email ?? ""].filter(Boolean) });
  });
  if (r === "space") return { message: "Choose one of your Spaces." };
  if (!r) return { message: "This import was already saved or cancelled." };
  const added = (r.contacts?.added ?? 0) + (r.calendar?.newPeople ?? 0);
  redirect(added ? "/people/triage" : "/settings/connections");
}

export async function cancelImportAction(importId: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => cancelFileImport(tx, id.parse(importId)));
  redirect("/settings/connections");
}
