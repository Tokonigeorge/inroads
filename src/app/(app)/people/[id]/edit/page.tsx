import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormPage } from "@/features/people/form-page";
import { EditIdentityForm } from "@/features/people/person-forms";
import { LoadingRows } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const metadata: Metadata = { title: "Edit person" };

export default function EditPersonPage({ params }: PageProps<"/people/[id]/edit">) {
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <Edit params={params} />
    </Suspense>
  );
}

async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await db.withUser(user.id, (tx) => tx.select().from(t.people).where(and(eq(t.people.id, id), isNull(t.people.deletedAt))));
  if (!p) notFound();
  return (
    <FormPage back={`/people/${id}`} backLabel={p.name} title={`Edit ${p.name}`}>
      <EditIdentityForm
        personId={id}
        identity={{ name: p.name, emails: p.emails, phones: p.phones, company: p.company, position: p.position, city: p.city, birthday: p.birthday, socials: p.socials as Record<string, string> }}
      />
    </FormPage>
  );
}
