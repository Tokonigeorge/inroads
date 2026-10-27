import type { Metadata } from "next";
import { Suspense } from "react";
import { PeopleListPane } from "@/features/people/people-list-pane";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";

export const metadata: Metadata = { title: "People" };

export default function PeoplePage() {
  return (
    <PageFrame>
      <Suspense fallback={<LoadingRows rows={8} />}>
        <PeopleListPane />
      </Suspense>
    </PageFrame>
  );
}
