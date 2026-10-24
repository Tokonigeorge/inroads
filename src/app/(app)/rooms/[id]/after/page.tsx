import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatLongDate, isIsoDate } from "@/domain/dates";
import { occurrences } from "@/domain/recurrence";
import { RoomDebrief } from "@/features/rooms/room-debrief";
import { LoadingRows } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { getRoom } from "@/server/repos/rooms";
import { userContext } from "@/server/user-context";
import { PageHeader } from "@/ui/layout";

export const metadata: Metadata = { title: "Who did you meet?" };

export default function AfterRoomPage({ params, searchParams }: PageProps<"/rooms/[id]/after">) {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-8 md:py-10">
      <Suspense fallback={<LoadingRows rows={6} />}>
        <AfterRoom params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AfterRoom({ params, searchParams }: Pick<PageProps<"/rooms/[id]/after">, "params" | "searchParams">) {
  const [{ id }, q, user] = await Promise.all([params, searchParams, requireUser()]);
  const data = await db.withUser(user.id, async (tx) => {
    const ctx = await userContext(tx);
    return { room: await getRoom(tx, id, ctx.today), today: ctx.today };
  });
  const d = data.room;
  if (!d) notFound();
  const on = typeof q.on === "string" && isIsoDate(q.on) ? q.on : d.past[0]?.date;
  if (!on || on > data.today || !occurrences(d.timing, on, on).length) notFound();

  // People already linked to the room for the whole series or this session, once each.
  const seen = new Set<string>();
  const linked = d.people
    .filter((p) => !p.occurrenceOn || p.occurrenceOn === on)
    .filter((p) => !seen.has(p.personId) && seen.add(p.personId))
    .map((p) => ({ id: p.personId, name: p.name, detail: [p.position, p.company].filter(Boolean).join(" at "), metThere: p.role === "met_there" }));

  return (
    <>
      <Link href={`/rooms/${d.room.id}`} className="mb-4 inline-flex items-center gap-1 text-small text-muted hover:text-text">
        <ArrowLeft size={14} aria-hidden /> {d.room.title}
      </Link>
      <PageHeader title={`Who did you meet at ${d.room.title}?`} subtitle={`${formatLongDate(on, data.today)} · ${d.space.name}. Tick who you met and Inroads logs it and lines up your follow-ups.`} />
      <RoomDebrief roomId={d.room.id} roomTitle={d.room.title} spaceId={d.space.id} occurrenceOn={on} linked={linked} />
    </>
  );
}
