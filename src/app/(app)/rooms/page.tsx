import type { Metadata } from "next";
import { Suspense } from "react";
import { formatLongDate } from "@/domain/dates";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";
import { loadSpaceView } from "@/features/spaces/space-view";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { listEventsPreview } from "@/server/repos/lists";
import { EmptyState, PageHeader } from "@/ui/layout";
import { ListRow } from "@/ui/list-row";

export const metadata: Metadata = { title: "Rooms" };

export default function RoomsPage() {
  return (
    <PageFrame>
      <PageHeader title="Rooms" />
      <Suspense fallback={<LoadingRows />}>
        <Rooms />
      </Suspense>
    </PageFrame>
  );
}

async function Rooms() {
  const user = await requireUser();
  const events = await db.withUser(user.id, async (tx) => listEventsPreview(tx, (await loadSpaceView(tx)).selected?.id ?? null));
  if (!events.length) return <EmptyState>Rooms are the meetings and events you go to. Add one, or connect a calendar.</EmptyState>;
  return (
    <ul className="-mx-4">
      {events.map((e) => (
        <li key={e.id}>
          <ListRow
            primary={e.title}
            secondary={[e.rrule ? `Repeats, from ${formatLongDate(e.startsOn)}` : formatLongDate(e.startsOn), e.location].filter(Boolean).join(" · ")}
          />
        </li>
      ))}
    </ul>
  );
}
