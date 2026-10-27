import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomRecord } from "@/features/rooms/room-record";
import { LoadingRows, PageFrame } from "@/features/shell/page-frame";

export const metadata: Metadata = { title: "Event" };
export const maxDuration = 300;

/** An event opened from a link or a refresh: the record as a full page. Inside the app it opens as a sheet. */
export default function RoomPage({ params }: PageProps<"/rooms/[id]">) {
  return (
    <PageFrame>
      <div className="mx-auto max-w-[620px] pt-4">
        <Suspense fallback={<LoadingRows rows={6} />}>
          <RoomRecord params={params} />
        </Suspense>
      </div>
    </PageFrame>
  );
}
