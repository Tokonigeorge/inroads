import type { Metadata } from "next";
import { Suspense } from "react";
import { EventsPage } from "@/features/rooms/events-page";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";

export const metadata: Metadata = { title: "Events" };
export const maxDuration = 300;

export default function RoomsPage() {
  return (
    <PageFrame>
      <Suspense fallback={<LoadingRows rows={6} />}>
        <EventsPage />
      </Suspense>
    </PageFrame>
  );
}
