import type { Metadata } from "next";
import { Suspense } from "react";
import { FormPage } from "@/features/people/form-page";
import { EditRoomForm, loadRoomForEdit } from "@/features/rooms/room-form-loaders";
import { LoadingRows } from "@/features/shell/page-frame";

export const metadata: Metadata = { title: "Edit event" };

export default function EditRoomPage({ params }: PageProps<"/rooms/[id]/edit">) {
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <Edit params={params} />
    </Suspense>
  );
}

async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const data = await loadRoomForEdit((await params).id);
  return (
    <FormPage back={`/rooms/${data.room.room.id}`} backLabel={data.room.room.title} title={`Edit ${data.room.room.title}`}>
      <EditRoomForm data={data} />
    </FormPage>
  );
}
