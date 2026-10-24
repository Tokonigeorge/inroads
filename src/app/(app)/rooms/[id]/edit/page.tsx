import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { RoomKind } from "@/contracts/rooms";
import { FormPage } from "@/features/people/form-page";
import { RoomForm } from "@/features/rooms/room-form";
import { loadRoomSpaceChoices } from "@/features/rooms/space-choices";
import { LoadingRows } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { getRoom } from "@/server/repos/rooms";
import { userContext } from "@/server/user-context";

export const metadata: Metadata = { title: "Edit room" };

export default function EditRoomPage({ params }: PageProps<"/rooms/[id]/edit">) {
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <Edit params={params} />
    </Suspense>
  );
}

async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const data = await db.withUser(user.id, async (tx) => {
    const ctx = await userContext(tx);
    return { room: await getRoom(tx, id, ctx.today), spaces: await loadRoomSpaceChoices(tx) };
  });
  if (!data.room) notFound();
  const { room: d, spaces } = data;
  const e = d.room;
  return (
    <FormPage back={`/rooms/${id}`} backLabel={e.title} title={`Edit ${e.title}`}>
      {d.unsupportedRule ? (
        <p className="mb-6 rounded-md bg-sunken p-3 text-small">This room came from a calendar with a repeat pattern Inroads can&apos;t edit. Saving here replaces it with the pattern below.</p>
      ) : null}
      <RoomForm
        roomId={id}
        spaces={spaces}
        values={{
          spaceId: e.spaceId,
          title: e.title,
          kind: e.kind as RoomKind,
          startsOn: e.startsOn,
          startTime: e.startTime?.slice(0, 5) ?? null,
          endTime: e.endTime?.slice(0, 5) ?? null,
          allDay: e.allDay,
          tz: e.tz,
          location: e.location,
          url: e.url,
          notes: e.notes,
          freq: d.recurrence.freq,
          byDays: d.recurrence.byDays ?? null,
          nth: d.recurrence.nth ?? null,
          untilOn: e.untilOn,
          goalId: e.goalId,
        }}
      />
    </FormPage>
  );
}
