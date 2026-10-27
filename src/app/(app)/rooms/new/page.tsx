import type { Metadata } from "next";
import { Suspense } from "react";
import { FormPage } from "@/features/people/form-page";
import { NewRoomFormLoader } from "@/features/rooms/room-form-loaders";
import { LoadingRows } from "@/features/shell/page-frame";

export const metadata: Metadata = { title: "Add event" };

export default function NewRoomPage({ searchParams }: PageProps<"/rooms/new">) {
  return (
    <FormPage back="/rooms" backLabel="Events" title="Add event">
      <Suspense fallback={<LoadingRows rows={8} />}>
        <NewRoomFormLoader searchParams={searchParams} />
      </Suspense>
    </FormPage>
  );
}
