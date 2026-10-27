import { Suspense } from "react";
import { NewRoomFormLoader } from "@/features/rooms/room-form-loaders";
import { RoomRecord, RoomTitle } from "@/features/rooms/room-record";
import { LoadingRows } from "@/features/shell/page-frame";
import { RouteSheet } from "@/features/shell/route-sheet";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** An event (or "Add event", for /rooms/new) opened from inside the app, as a sheet (prototype L1126). */
export default function RoomSheetPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={null}>
      <RoomSheet params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function RoomSheet({ params, searchParams }: Props) {
  const { id } = await params;
  if (id === "new") {
    return (
      <RouteSheet title="Add event">
        <Suspense fallback={<LoadingRows rows={8} />}>
          <NewRoomFormLoader searchParams={searchParams} />
        </Suspense>
      </RouteSheet>
    );
  }
  return (
    <RouteSheet
      key={id}
      title={
        <Suspense fallback="Event">
          <RoomTitle params={params} />
        </Suspense>
      }
    >
      <Suspense fallback={<LoadingRows rows={6} />}>
        <RoomRecord params={params} />
      </Suspense>
    </RouteSheet>
  );
}
