import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { listPeoplePreview } from "@/server/repos/lists";
import { EmptyState, PageHeader } from "@/ui/layout";
import { Avatar, ListRow } from "@/ui/list-row";

export const metadata: Metadata = { title: "People" };

export default function PeoplePage() {
  return (
    <PageFrame>
      <PageHeader title="People" />
      <Suspense fallback={<LoadingRows rows={8} />}>
        <People />
      </Suspense>
    </PageFrame>
  );
}

async function People() {
  const user = await requireUser();
  const { view, people } = await db.withUser(user.id, async (tx) => {
    const view = await loadSpaceView(tx);
    return { view, people: await listPeoplePreview(tx, view.selected?.id ?? null) };
  });
  if (!people.length) {
    return (
      <EmptyState>
        {view.selected ? `No one in ${view.selected.name} yet.` : "No one here yet. Load the example network from Settings to look around."}
      </EmptyState>
    );
  }
  return (
    <ul className="-mx-4" aria-label={view.selected ? `People in ${view.selected.name}` : "People"}>
      {people.map((p) => (
        <li key={p.id}>
          <ListRow
            leading={<Avatar name={p.name} />}
            primary={p.name}
            secondary={[p.position, p.company].filter(Boolean).join(" · ") || "No role added yet"}
          />
        </li>
      ))}
    </ul>
  );
}
