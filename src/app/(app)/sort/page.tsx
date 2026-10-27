import type { Metadata } from "next";
import { Suspense } from "react";
import { formatPhone } from "@/domain/normalise";
import { TriageQueue, type TriageCard } from "@/features/people/triage-queue";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { listTriage } from "@/server/import/triage";
import { PageHeader } from "@/ui/layout";

export const metadata: Metadata = { title: "Sort new people" };

export default function TriagePage() {
  return (
    <PageFrame>
      <PageHeader stamp="People" title="Sort new people" subtitle="People from your imports, one at a time: keep the ones that matter." />
      <div className="max-w-[640px]">
        <Suspense fallback={<LoadingRows rows={4} />}>
          <Triage />
        </Suspense>
      </div>
    </PageFrame>
  );
}

async function Triage() {
  const user = await requireUser();
  const { list, view } = await db.withUser(user.id, async (tx) => {
    const view = await loadSpaceView(tx);
    return { view, list: await listTriage(tx, view.selected?.id ?? null, 50) };
  });
  const items: TriageCard[] = list.items.map((i) => ({
    membershipId: i.membershipId,
    name: i.name,
    detail: [i.position, i.company].filter(Boolean).join(" at "),
    contact: [i.emails[0], i.phones[0] ? formatPhone(i.phones[0]) : null].filter(Boolean).join(" · "),
    spaceName: i.spaceName,
    suggestion: i.suggestion,
  }));
  return <TriageQueue items={items} total={list.total} byAction={list.byAction} spaceId={view.selected?.id ?? null} showSpaces={view.spaces.length > 1} />;
}
