import { Suspense } from "react";
import { EditRoomForm, loadRoomForEdit } from "@/features/rooms/room-form-loaders";
import { RouteSheet } from "@/features/shell/route-sheet";

type Props = { params: Promise<{ id: string }> };

/** "Edit {title}" as a sheet. */
export default function EditRoomSheetPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <EditRoomSheet params={params} />
    </Suspense>
  );
}

async function EditRoomSheet({ params }: Props) {
  const data = await loadRoomForEdit((await params).id);
  return (
    <RouteSheet title={`Edit ${data.room.room.title}`}>
      <EditRoomForm data={data} />
    </RouteSheet>
  );
}
