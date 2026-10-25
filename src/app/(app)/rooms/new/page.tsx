import type { Metadata } from "next";
import { Suspense } from "react";
import { FormPage } from "@/features/people/form-page";
import { RoomForm } from "@/features/rooms/room-form";
import { loadRoomSpaceChoices } from "@/features/rooms/space-choices";
import { LoadingRows } from "@/features/shell/page-frame";
import { isAiConfigured } from "@/server/ai/config";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { readSelectedSpaceId } from "@/server/space-selection";
import { userContext } from "@/server/user-context";

export const metadata: Metadata = { title: "Add a room" };

export default function NewRoomPage({ searchParams }: PageProps<"/rooms/new">) {
  return (
    <FormPage back="/rooms" backLabel="Rooms" title="Add a room">
      <Suspense fallback={<LoadingRows rows={8} />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </FormPage>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/rooms/new">["searchParams"] }) {
  const [user, selected, q] = await Promise.all([requireUser(), readSelectedSpaceId(), searchParams]);
  // Prefill from a suggested room (?title=&date=&time=&location=&url=&notes=).
  const one = (k: string) => {
    const v = q[k];
    return (Array.isArray(v) ? v[0] : v)?.slice(0, 2000) || null;
  };
  const date = one("date");
  const time = one("time");
  const { spaces, ctx } = await db.withUser(user.id, async (tx) => ({ spaces: await loadRoomSpaceChoices(tx), ctx: await userContext(tx) }));
  const spaceId = spaces.find((s) => s.id === selected)?.id ?? spaces[0]?.id ?? "";
  return (
    <RoomForm
      roomId={null}
      spaces={spaces}
      aiEnabled={isAiConfigured()}
      values={{ spaceId, title: one("title")?.slice(0, 120) ?? "", kind: "meetup", startsOn: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ctx.today, startTime: time && /^\d{2}:\d{2}$/.test(time) ? time : "18:00", endTime: null, allDay: false, tz: ctx.timezone, location: one("location"), url: one("url"), notes: one("notes"), freq: "none", byDays: null, nth: null, untilOn: null, goalId: null }}
    />
  );
}
