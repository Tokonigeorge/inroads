import { notFound } from "next/navigation";
import { cache } from "react";
import type { RoomKind } from "@/contracts/rooms";
import { isAiConfigured } from "@/server/ai/config";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { loadPlan, roomDetailsOf } from "@/server/repos/prep";
import { getRoom } from "@/server/repos/rooms";
import { readSelectedSpaceId } from "@/server/space-selection";
import { userContext } from "@/server/user-context";
import { RoomForm } from "./room-form";
import { loadRoomSpaceChoices } from "./space-choices";

/** "Add event" (prototype L1108), for the sheet and the full page. Prefilled from Radar, a look-up or a URL. */
export async function NewRoomFormLoader({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, selected, q] = await Promise.all([requireUser(), readSelectedSpaceId(), searchParams]);
  // Prefill from a suggested room (?title=&date=&time=&location=&url=&notes=).
  const one = (k: string) => {
    const v = q[k];
    return (Array.isArray(v) ? v[0] : v)?.slice(0, 2000) || null;
  };
  const date = one("date");
  const time = one("time");
  // Or from a look-up ("Add as a room", ?prep=<searchId>): filled in, with its plan attached on save.
  const prep = one("prep");
  const { spaces, ctx, plan } = await db.withUser(user.id, async (tx) => ({
    spaces: await loadRoomSpaceChoices(tx),
    ctx: await userContext(tx),
    plan: prep && /^[0-9a-f-]{36}$/i.test(prep) ? await loadPlan(tx, prep) : null,
  }));
  const fromPrep = plan && !plan.eventId ? { searchId: plan.id, found: roomDetailsOf(plan) } : null;
  const spaceId = (plan && spaces.find((s) => s.id === plan.spaceId)?.id) ?? spaces.find((s) => s.id === selected)?.id ?? spaces[0]?.id ?? "";
  return (
    <RoomForm
      roomId={null}
      spaces={spaces}
      aiEnabled={isAiConfigured()}
      fromPrep={fromPrep}
      values={{ spaceId, title: one("title")?.slice(0, 120) ?? "", kind: "meetup", startsOn: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ctx.today, startTime: time && /^\d{2}:\d{2}$/.test(time) ? time : "18:00", endTime: null, allDay: false, tz: ctx.timezone, location: one("location"), url: one("url"), notes: one("notes"), freq: "none", byDays: null, nth: null, untilOn: null, goalId: null }}
    />
  );
}

/** The event and your Spaces, for "Edit {title}". */
export const loadRoomForEdit = cache(async (id: string) => {
  const user = await requireUser();
  const data = await db.withUser(user.id, async (tx) => {
    const ctx = await userContext(tx);
    return { room: await getRoom(tx, id, ctx.today), spaces: await loadRoomSpaceChoices(tx) };
  });
  if (!data.room) notFound();
  return { room: data.room, spaces: data.spaces };
});

export function EditRoomForm({ data }: { data: Awaited<ReturnType<typeof loadRoomForEdit>> }) {
  const { room: d, spaces } = data;
  const e = d.room;
  const id = e.id;
  return (
    <>
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
    </>
  );
}
