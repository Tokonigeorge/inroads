"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { socialKeys } from "@/contracts/people";
import type { FormState } from "@/features/forms";
import { autoResearch } from "@/server/ai/auto-research";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { createPerson } from "@/server/repos/people";
import { discardShare, getShare } from "@/server/repos/share";
import { userContext } from "@/server/user-context";

const id = z.string().uuid();
const addSchema = z.object({
  shareId: id,
  spaceId: id,
  name: z.string().trim().min(1, "Add their name.").max(120),
  position: z.string().trim().max(120),
  company: z.string().trim().max(120),
  social: z.enum(socialKeys),
  url: z.string().trim().url().max(200),
  note: z.string().trim().max(500),
});

/** Adds the person from a shared profile link, then forgets the share. */
export async function addSharedPersonAction(input: z.input<typeof addSchema>): Promise<FormState & { personId?: string }> {
  const user = await requireUser();
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Check the details." };
  const d = parsed.data;
  const r = await db.withUser(user.id, async (tx) => {
    if (!(await getShare(tx, d.shareId))) return { ok: false as const, message: "This share was already added or discarded." };
    const { today } = await userContext(tx);
    const created = await createPerson(
      tx,
      user.id,
      { id: randomUUID(), identity: { name: d.name, position: d.position, company: d.company, socials: { [d.social]: d.url } }, membership: { spaceId: d.spaceId, notes: d.note } },
      today,
    );
    if (created.ok) await discardShare(tx, d.shareId);
    return created;
  });
  if (!r.ok) return { message: r.message };
  await autoResearch(user.id, r.data.id, d.spaceId);
  return { ok: true, personId: r.data.id };
}

export async function discardShareAction(shareId: string) {
  const user = await requireUser();
  await db.withUser(user.id, (tx) => discardShare(tx, id.parse(shareId)));
}
