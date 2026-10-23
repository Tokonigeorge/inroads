import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { listGoalsPreview } from "@/server/repos/lists";
import { EmptyState, PageHeader } from "@/ui/layout";
import { ListRow } from "@/ui/list-row";

export const metadata: Metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <PageFrame>
      <PageHeader title="Goals" />
      <Suspense fallback={<LoadingRows />}>
        <Goals />
      </Suspense>
    </PageFrame>
  );
}

async function Goals() {
  const user = await requireUser();
  const goals = await listGoalsPreview(user.id);
  if (!goals.length) return <EmptyState>Set a goal and Inroads weighs every person, room and reminder against it.</EmptyState>;
  return (
    <ul className="-mx-4">
      {goals.map((g) => (
        <li key={g.id}>
          <ListRow primary={g.text} secondary={`${g.space} · aim for ${g.weeklyTarget} touches a week`} />
        </li>
      ))}
    </ul>
  );
}
