import { Suspense } from "react";
import { RoomsListPane } from "@/features/rooms/rooms-list-pane";
import { ListDetailShell } from "@/features/shell/list-detail-shell";

function ListSkeleton() {
  return (
    <div className="grid gap-2 p-4" role="status" aria-busy="true" aria-label="Loading rooms">
      <div className="h-8 w-32 rounded-md bg-sunken" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-12 rounded-md bg-sunken" />
      ))}
    </div>
  );
}

export default function RoomsLayout({ children }: LayoutProps<"/rooms">) {
  const list = (
    <Suspense fallback={<ListSkeleton />}>
      <RoomsListPane />
    </Suspense>
  );
  return <ListDetailShell list={list}>{children}</ListDetailShell>;
}
