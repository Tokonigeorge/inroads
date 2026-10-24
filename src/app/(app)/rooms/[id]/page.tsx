import { ArrowLeft, ExternalLink, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { roomKindLabels, roomRoleLabels, type RoomKind, type RoomRole } from "@/contracts/rooms";
import { addDays, formatLongDate } from "@/domain/dates";
import type { RoomRoi } from "@/domain/room-roi";
import { recurrenceLabel } from "@/domain/recurrence";
import { expandAgenda, formatTime, zoneCity } from "@/domain/zoned";
import { AttendanceToggle, RoomActions, UnlinkButton } from "@/features/rooms/room-actions";
import { LoadingRows } from "@/features/shell/page-frame";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { roomImpact } from "@/server/repos/room-impact";
import { getRoom, type RoomDetail } from "@/server/repos/rooms";
import { userContext } from "@/server/user-context";
import { EmptyState } from "@/ui/layout";
import { Avatar } from "@/ui/list-row";

export const metadata: Metadata = { title: "Room" };

export default function RoomPage({ params }: PageProps<"/rooms/[id]">) {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-8 md:py-10">
      <Link href="/rooms" className="mb-4 inline-flex items-center gap-1 text-small text-muted hover:text-text md:hidden">
        <ArrowLeft size={14} aria-hidden /> Rooms
      </Link>
      <Suspense fallback={<LoadingRows rows={6} />}>
        <Room params={params} />
      </Suspense>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border py-6">
      <h2 className="pb-3 text-title font-semibold">{title}</h2>
      {children}
    </section>
  );
}

async function Room({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const data = await db.withUser(user.id, async (tx) => {
    const ctx = await userContext(tx);
    const room = await getRoom(tx, id, ctx.today);
    return { room, ctx, impact: room ? await roomImpact(tx, room.room.id, ctx.today) : null };
  });
  if (!data.room || !data.impact) notFound();
  return <RoomView d={data.room} today={data.ctx.today} userTz={data.ctx.timezone} impact={data.impact} />;
}

function when(d: RoomDetail, date: string, today: string, userTz: string) {
  const e = d.room;
  if (e.allDay || !e.startTime) return `${formatLongDate(date, today)} · all day`;
  const [item] = expandAgenda([{ ...d.timing, start: date, freq: "none" }], addDays(date, -1), addDays(date, 1), userTz);
  if (!item?.time) return formatLongDate(date, today);
  const end = e.endTime && e.tz === userTz ? `–${formatTime(e.endTime.slice(0, 5))}` : "";
  return `${formatLongDate(item.date, today)} · ${formatTime(item.time)}${end}${item.localTimeLabel ? ` (${item.localTimeLabel})` : ""}`;
}

function RoomView({ d, today, userTz, impact }: { d: RoomDetail; today: string; userTz: string; impact: RoomRoi }) {
  const e = d.room;
  const repeats = d.recurrence.freq !== "none";
  const headlineDate = d.next[0] ?? e.startsOn;
  const went = d.past.filter((p) => p.attended).length;
  const answered = d.past.filter((p) => p.attended !== null).length;
  const byRole = new Map<RoomRole, RoomDetail["people"]>();
  for (const p of d.people) byRole.set(p.role as RoomRole, [...(byRole.get(p.role as RoomRole) ?? []), p]);

  return (
    <article>
      <header className="grid gap-3 pb-6">
        <p className="text-small text-muted">
          {[roomKindLabels[e.kind as RoomKind] ?? e.kind, repeats ? recurrenceLabel(d.recurrence) : null, d.space.name].filter(Boolean).join(" · ")}
          {e.untilOn ? ` · until ${formatLongDate(e.untilOn, today)}` : ""}
        </p>
        <h1 className="font-display text-[1.5rem] leading-[1.875rem] font-medium md:text-display">{e.title}</h1>
        <p>
          {repeats && d.next[0] ? "Next: " : ""}
          {repeats && !d.next[0] ? "This series has ended." : when(d, headlineDate, today, userTz)}
        </p>
        {!e.allDay && e.startTime && e.tz !== userTz ? <p className="text-small text-muted">Times shown in your time zone. The room is in {zoneCity(e.tz)} time.</p> : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-small">
          {e.location ? (
            <span className="flex items-center gap-1.5">
              <MapPin size={14} aria-hidden /> {e.location}
            </span>
          ) : null}
          {e.url ? (
            <a href={e.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-accent hover:underline">
              <ExternalLink size={14} aria-hidden /> Event page
            </a>
          ) : null}
          {d.goal ? <span className="text-muted">Serves: {d.goal.text}</span> : null}
        </div>
        <RoomActions roomId={e.id} title={e.title} spaceId={d.space.id} />
      </header>

      <Block title="People">
        {d.people.length ? (
          <div className="grid gap-4">
            {[...byRole].map(([role, people]) => (
              <div key={role}>
                <h3 className="pb-1 text-small font-[550] text-muted">{roomRoleLabels[role]}</h3>
                <ul className="-mx-2">
                  {people.map((p) => (
                    <li key={`${p.personId}:${role}`} className="flex items-center gap-2 rounded-md pr-1 hover:bg-sunken">
                      <Link href={`/people/${p.personId}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-2">
                        <Avatar name={p.name} />
                        <span className="grid min-w-0">
                          <span className="truncate font-[550]">{p.name}</span>
                          <span className="truncate text-small text-muted">{[p.position, p.company].filter(Boolean).join(" · ") || "No role added yet"}</span>
                        </span>
                      </Link>
                      <UnlinkButton roomId={e.id} personId={p.personId} role={role} name={p.name} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>Add who you expect to see, or who you met there, so you can prepare and follow up.</EmptyState>
        )}
      </Block>

      {d.past.length ? <Impact impact={impact} today={today} roomId={e.id} lastSession={d.past[0]?.date ?? null} /> : null}

      {d.past.length ? (
        <Block title="Did you go?">
          {repeats && answered ? <p className="pb-3 text-small text-muted">You went to {went} of the last {d.past.length} sessions.</p> : null}
          <ul className="grid gap-2">
            {d.past.map((p) => (
              <li key={p.date} className="flex flex-wrap items-center justify-between gap-2">
                <span>{formatLongDate(p.date, today)}</span>
                <span className="flex flex-wrap items-center gap-2">
                  {p.attended !== false ? (
                    <Link href={`/rooms/${e.id}/after?on=${p.date}`} className="text-small font-[550] text-accent hover:underline">
                      Who did you meet?
                    </Link>
                  ) : null}
                  <AttendanceToggle roomId={e.id} date={p.date} label={formatLongDate(p.date, today)} attended={p.attended} />
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {repeats && d.next.length > 1 ? (
        <Block title="Coming up">
          <ul className="grid gap-1">
            {d.next.slice(1).map((date) => (
              <li key={date}>{when(d, date, today, userTz)}</li>
            ))}
          </ul>
        </Block>
      ) : null}

      {e.notes ? (
        <Block title="Notes">
          <p className="whitespace-pre-line">{e.notes}</p>
        </Block>
      ) : null}
    </article>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What the room has led to: who you met there, whether you've kept in touch, goal progress. */
function Impact({ impact, today, roomId, lastSession }: { impact: RoomRoi; today: string; roomId: string; lastSession: string | null }) {
  if (!impact.met) {
    return (
      <Block title="What it's led to">
        <p className="text-small text-muted">
          After a session, record who you met{" "}
          {lastSession ? (
            <Link href={`/rooms/${roomId}/after?on=${lastSession}`} className="font-[550] text-accent hover:underline">
              (Who did you meet?)
            </Link>
          ) : null}{" "}
          and this shows whether the room is worth your evenings.
        </p>
      </Block>
    );
  }
  const summary = [
    plural(impact.met, "person met", "people met"),
    `${impact.keptInTouch} kept in touch`,
    `${impact.inTouchNow} in touch in the last 60 days`,
    impact.movedForward ? `${impact.movedForward} moved forward on your goals` : null,
    impact.won ? `${impact.won} won` : null,
  ].filter(Boolean);
  return (
    <Block title="What it's led to">
      <p className="pb-3">{summary.join(" · ")}</p>
      <ul className="grid gap-2 text-small">
        {impact.people.slice(0, 12).map((p) => (
          <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <Link href={`/people/${p.id}`} className="font-[550] hover:underline">
              {p.name}
            </Link>
            <span className="text-muted">
              {[
                `met ${formatLongDate(p.metOn, today)}`,
                p.touchesSince ? `${plural(p.touchesSince, "touch", "touches")} since, last ${formatLongDate(p.lastTouchOn!, today)}` : "no touches since",
                p.won ? "won" : p.forward ? "moved forward" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </Block>
  );
}
