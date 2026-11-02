import type { Metadata } from "next";
import { Suspense } from "react";
import { formatPhone } from "@/domain/normalise";
import { TriageQueue, type TriageCard } from "@/features/people/triage-queue";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { listTriage, previewSortRules } from "@/server/import/triage";
import { userContext } from "@/server/user-context";
import { PageHeader } from "@/ui/layout";

export const metadata: Metadata = { title: "Sort new people" };

export default function TriagePage() {
  return (
    <PageFrame>
      <PageHeader stamp="People" title="Sort new people" subtitle="People from your imports. Choose how to sort them, or go one at a time." />
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
  const { list, view, rules } = await db.withUser(user.id, async (tx) => {
    const [view, ctx] = await Promise.all([loadSpaceView(tx), userContext(tx)]);
    const spaceId = view.selected?.id ?? null;
    const [list, rules] = await Promise.all([listTriage(tx, spaceId, 50), previewSortRules(tx, spaceId, ctx.today)]);
    return { view, list, rules };
  });
  const items: TriageCard[] = list.items.map((i) => ({
    membershipId: i.membershipId,
    name: i.name,
    detail: [i.position, i.company].filter(Boolean).join(" at "),
    contact: [i.emails[0], i.phones[0] ? formatPhone(i.phones[0]) : null].filter(Boolean).join(" · "),
    spaceName: i.spaceName,
    suggestion: i.suggestion,
  }));
  return <TriageQueue items={items} total={list.total} rules={rules.options} spaceId={view.selected?.id ?? null} showSpaces={view.spaces.length > 1} />;
}
