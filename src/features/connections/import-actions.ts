"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { cancelFileImport, commitFileImport } from "@/server/import/files";
import { listSpaces } from "@/server/repos/spaces";
import { userContext } from "@/server/user-context";

const id = z.string().uuid();
const optionsSchema = z.object({
  contacts: z.boolean(),
  skipNameless: z.boolean(),
  calendars: z.array(z.string().max(200)).max(50).nullable(),
  includeSolo: z.boolean(),
  meEmails: z.string().max(1000),
});

export async function commitImportAction(importId: string, spaceId: string, raw: z.input<typeof optionsSchema>): Promise<{ message: string }> {
  const user = await requireUser();
  const o = optionsSchema.parse(raw);
  // "Your email address in these calendars" is remembered on your profile for next time.
  const typed = o.meEmails
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => z.string().email().safeParse(e).success);
  const r = await db.withUser(user.id, async (tx) => {
    const spaces = await listSpaces(tx);
    if (!spaces.some((s) => s.id === spaceId)) return "space" as const;
    const [ctx, [profile]] = await Promise.all([userContext(tx), tx.select({ emails: t.profiles.emails }).from(t.profiles)]);
    const emails = [...new Set([...(profile?.emails ?? []), ...typed])];
    if (emails.length !== (profile?.emails ?? []).length) await tx.update(t.profiles).set({ emails }).where(eq(t.profiles.userId, user.id));
    return commitFileImport(tx, {
      userId: user.id,
      importId: id.parse(importId),
      spaceId,
      today: ctx.today,
      meEmails: [...emails, user.email ?? ""].filter(Boolean),
      options: { contacts: o.contacts, skipNameless: o.skipNameless, calendars: o.calendars, includeSolo: o.includeSolo },
    });
  });
  if (r === "space") return { message: "Choose one of your Spaces." };
  if (!r) return { message: "This import was already saved or cancelled." };
  // The same address shows "Import complete" now.
  redirect(`/settings/imports/${importId}`);
}

export async function cancelImportAction(importId: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => cancelFileImport(tx, id.parse(importId)));
  redirect("/settings/connections");
}
