import type { Metadata } from "next";
import { Suspense } from "react";
import { FormPage } from "@/features/people/form-page";
import { emptyIdentity } from "@/features/people/person-defaults";
import { NewPersonForm } from "@/features/people/person-forms";
import { loadSpaceOptions } from "@/features/people/space-options";
import { LoadingRows } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { readSelectedSpaceId } from "@/server/space-selection";

export const metadata: Metadata = { title: "Add a person" };

export default function NewPersonPage({ searchParams }: PageProps<"/people/new">) {
  return (
    <FormPage back="/people" backLabel="People" title="Add a person">
      <Suspense fallback={<LoadingRows rows={8} />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </FormPage>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/people/new">["searchParams"] }) {
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
  const spaces = await db.withUser(user.id, loadSpaceOptions);
  const defaultSpaceId = spaces.find((s) => s.id === selected)?.id ?? spaces[0]?.id ?? "";
  return <NewPersonForm spaces={spaces} defaultSpaceId={defaultSpaceId} initial={initial} />;
}
