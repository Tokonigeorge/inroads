import { Suspense } from "react";
import { PeopleListPane } from "@/features/people/people-list-pane";
import { ListDetailShell } from "@/features/shell/list-detail-shell";

function ListSkeleton() {
  return (
    <div className="grid gap-2 p-4" role="status" aria-busy="true" aria-label="Loading people">
      <div className="h-8 w-32 rounded-md bg-sunken" />
      <div className="h-10 rounded-md bg-sunken" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-12 rounded-md bg-sunken" />
      ))}
    </div>
  );
}

export default function PeopleLayout({ children }: LayoutProps<"/people">) {
  const list = (
    <Suspense fallback={<ListSkeleton />}>
      <PeopleListPane />
    </Suspense>
  );
  return <ListDetailShell list={list}>{children}</ListDetailShell>;
}
