import type { Metadata } from "next";
import { Suspense } from "react";
import { FormPage } from "@/features/people/form-page";
import { RoomForm } from "@/features/rooms/room-form";
import { loadRoomSpaceChoices } from "@/features/rooms/space-choices";
import { LoadingRows } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { readSelectedSpaceId } from "@/server/space-selection";
import { userContext } from "@/server/user-context";

export const metadata: Metadata = { title: "Add a room" };

export default function NewRoomPage() {
  return (
    <FormPage back="/rooms" backLabel="Rooms" title="Add a room">
      <Suspense fallback={<LoadingRows rows={8} />}>
        <Form />
      </Suspense>
    </FormPage>
  );
}

async function Form() {
  const [user, selected] = await Promise.all([requireUser(), readSelectedSpaceId()]);
  const { spaces, ctx } = await db.withUser(user.id, async (tx) => ({ spaces: await loadRoomSpaceChoices(tx), ctx: await userContext(tx) }));
  const spaceId = spaces.find((s) => s.id === selected)?.id ?? spaces[0]?.id ?? "";
  return (
    <RoomForm
      roomId={null}
      spaces={spaces}
      values={{ spaceId, title: "", kind: "meetup", startsOn: ctx.today, startTime: "18:00", endTime: null, allDay: false, tz: ctx.timezone, location: null, url: null, notes: null, freq: "none", byDays: null, nth: null, untilOn: null, goalId: null }}
    />
  );
}
