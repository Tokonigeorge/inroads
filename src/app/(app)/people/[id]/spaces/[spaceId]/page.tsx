import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormPage } from "@/features/people/form-page";
import { emptyMembership } from "@/features/people/person-defaults";
import { MembershipForm } from "@/features/people/person-forms";
import { loadSpaceOptions } from "@/features/people/space-options";
import { LoadingRows } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { getPerson } from "@/server/repos/people";

export const metadata: Metadata = { title: "Relationship details" };

export default function MembershipPage({ params }: PageProps<"/people/[id]/spaces/[spaceId]">) {
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <Membership params={params} />
    </Suspense>
  );
}

/** `/people/:id/spaces/new` adds them to another Space; `/people/:id/spaces/:spaceId` edits one. */
async function Membership({ params }: { params: Promise<{ id: string; spaceId: string }> }) {
  const [{ id, spaceId }, user] = await Promise.all([params, requireUser()]);
  const data = await db.withUser(user.id, async (tx) => ({ detail: await getPerson(tx, id), spaces: await loadSpaceOptions(tx) }));
  if (!data.detail) notFound();
  const { detail, spaces } = data;
  const back = `/people/${id}`;

  if (spaceId === "new") {
    const joined = new Set(detail.memberships.map((m) => m.spaceId));
    const available = spaces.filter((s) => !joined.has(s.id));
    return (
      <FormPage back={back} backLabel={detail.person.name} title={`Add ${detail.person.name} to another Space`}>
        {available.length ? (
          <MembershipForm personId={id} spaces={available} values={emptyMembership(available[0].id)} isNew />
        ) : (
          <p className="text-muted">They&apos;re already in all your Spaces. Add a new Space in Settings first.</p>
        )}
      </FormPage>
    );
  }

  const m = detail.memberships.find((x) => x.spaceId === spaceId);
  if (!m) notFound();
  return (
    <FormPage back={back} backLabel={detail.person.name} title={`${detail.person.name} in ${m.space.name}`}>
      <MembershipForm
        personId={id}
        spaces={spaces.filter((s) => s.id === spaceId)}
        isNew={false}
        values={{
          spaceId,
          whereMet: m.whereMet,
          metOn: m.metOn,
          interests: m.interests,
          notes: m.notes,
          opportunities: m.opportunities,
          tags: m.tags,
          circleId: m.circleId,
          cadenceDays: m.cadenceDays,
          starred: m.starred,
        }}
      />
    </FormPage>
  );
}
