import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { readSelectedSpaceId } from "@/server/space-selection";
import { userContext } from "@/server/user-context";
import { emptyIdentity } from "./person-defaults";
import { EditIdentityForm, NewPersonForm } from "./person-forms";
import { loadSpaceOptions } from "./space-options";

type Query = Record<string, string | string[] | undefined>;

/** "Add person", for the sheet and the full page. `?from=card` pre-fills what a business card said. */
export async function NewPersonFormLoader({ searchParams }: { searchParams: Promise<Query> }) {
  const [user, selected, q] = await Promise.all([requireUser(), readSelectedSpaceId(), searchParams]);
  const one = (k: string) => {
    const v = q[k];
    return (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 300) || null;
  };
  // Details read from a business card (see features/ai/card-scan.tsx), to check before saving.
  const socials = Object.fromEntries((["linkedin", "x", "instagram", "website"] as const).flatMap((k) => (one(k) ? [[k, one(k)!]] : [])));
  const initial =
    one("from") === "card"
      ? {
          identity: { ...emptyIdentity, name: one("name") ?? "", emails: one("email") ? [one("email")!] : [], phones: one("phone") ? [one("phone")!] : [], company: one("company"), position: one("position"), socials },
          notes: one("notes"),
          note: "Read from the card. Check the details, then add them.",
        }
      : undefined;
  const { spaces, today } = await db.withUser(user.id, async (tx) => ({ spaces: await loadSpaceOptions(tx), today: (await userContext(tx)).today }));
  const defaultSpaceId = spaces.find((s) => s.id === selected)?.id ?? spaces[0]?.id ?? "";
  return <NewPersonForm spaces={spaces} defaultSpaceId={defaultSpaceId} initial={initial} today={today} />;
}

export async function loadPersonIdentity(id: string) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await db.withUser(user.id, (tx) => tx.select().from(t.people).where(and(eq(t.people.id, id), isNull(t.people.deletedAt))));
  if (!p) notFound();
  return p;
}

export function EditPersonForm({ p }: { p: Awaited<ReturnType<typeof loadPersonIdentity>> }) {
  return (
    <EditIdentityForm
      personId={p.id}
      identity={{ name: p.name, emails: p.emails, phones: p.phones, company: p.company, position: p.position, city: p.city, birthday: p.birthday, socials: p.socials as Record<string, string> }}
    />
  );
}
