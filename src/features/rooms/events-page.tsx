import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import type { ReactNode } from "react";
import { roomKindLabels, type RoomKind } from "@/contracts/rooms";
import { formatLongDate } from "@/domain/dates";
import { recurrenceLabel } from "@/domain/recurrence";
import { formatTime } from "@/domain/zoned";
import { AiJobButton } from "@/features/ai/ai-job-button";
import { RoomIdeas, type RoomIdea } from "@/features/ai/room-ideas";
import { loadSpaceView } from "@/features/spaces/space-view";
import { isAiConfigured } from "@/server/ai/config";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { roomImpactCounts } from "@/server/repos/room-impact";
import { listPast, listSeries, listUpcoming, whereNetworkGathers } from "@/server/repos/rooms";
import { userContext } from "@/server/user-context";
import { Button } from "@/ui/button";
import { PageHeader, Section } from "@/ui/layout";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ymd = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** The prototype's date tile (L195): day number over a mono month. */
function DateTile({ date }: { date: string | null }) {
  if (!date) {
    return (
      <span className="date-tile" aria-hidden>
        <b>–</b>
        <i>ended</i>
      </span>
    );
  }
  const d = ymd(date);
  return (
    <span className="date-tile" aria-hidden>
      <b>{d.getUTCDate()}</b>
      <i>{MONTHS[d.getUTCMonth()]}</i>
    </span>
  );
}

function EventRow({ href, date, title, lines, end }: { href: string; date: string | null; title: string; lines: (string | null | undefined)[]; end?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="row">
        <DateTile date={date} />
        <span className="grid min-w-0 gap-px">
          <span className="row-name">{title}</span>
          {lines.filter(Boolean).map((l, i) => (
            <span key={i} className="row-sub">
              {l}
            </span>
          ))}
        </span>
        <span className="grid justify-items-end gap-1 text-right">{end}</span>
      </Link>
    </li>
  );
}

const kindLabel = (k: string) => roomKindLabels[k as RoomKind] ?? "Event";
const Mono = ({ children }: { children: ReactNode }) => <span className="font-mono text-[11px] tracking-[0.06em] text-faint uppercase">{children}</span>;
const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/**
 * The prototype's Events tab (L929–964), one page: Next 30 days, Radar, Recurring, Where your
 * network gathers, then the past (folded).
 */
export async function EventsPage() {
  const user = await requireUser();
  const aiEnabled = isAiConfigured();
  const data = await db.withUser(user.id, async (tx) => {
    const [view, ctx] = await Promise.all([loadSpaceView(tx), userContext(tx)]);
    const spaceId = view.selected?.id ?? null;
    const radarSpace = view.selected ?? view.spaces.find((s) => s.kind === "work") ?? view.spaces[0] ?? null;
    const [upcoming, series, past, gathers, [radar]] = await Promise.all([
      listUpcoming(tx, spaceId, ctx.today, ctx.timezone, 30),
      listSeries(tx, spaceId, ctx.today),
      listPast(tx, spaceId, ctx.today),
      whereNetworkGathers(tx, spaceId),
      radarSpace
        ? tx
            .select()
            .from(t.searches)
            .where(and(eq(t.searches.type, "radar"), eq(t.searches.spaceId, radarSpace.id)))
            .orderBy(desc(t.searches.createdAt))
            .limit(1)
        : Promise.resolve([]),
    ]);
    const impact = new Map(await roomImpactCounts(tx, [...series.map((s) => s.id), ...past.map((p) => p.id)], ctx.today));
    return { today: ctx.today, upcoming, series, past, gathers, radar: radar ?? null, radarSpace, impact, spaceName: view.selected?.name ?? null };
  });
  const { today, series, past, gathers, radar, radarSpace, impact } = data;
  // At most two sessions per series, like the prototype (L931).
  const perSeries = new Map<string, number>();
  const upcoming = data.upcoming.filter((u) => {
    const n = (perSeries.get(u.eventId) ?? 0) + 1;
    perSeries.set(u.eventId, n);
    return n <= 2;
  });
  const seriesById = new Map(series.map((s) => [s.id, s]));
  const radarResult = radar?.result as { items: RoomIdea[]; from: string; to: string } | undefined;
  const impactLabel = (id: string) => {
    const i = impact.get(id);
    return i?.met ? `Met ${i.met} · ${i.inTouchNow} in touch` : null;
  };

  return (
    <>
      <PageHeader
        stamp={`${upcoming.length} coming up in 30 days`}
        title="Rooms that matter"
        actions={
          <>
            <Button asChild variant="primary">
              <Link href="/rooms/new">+ Add event</Link>
            </Button>
            <Button asChild>
              <Link href="/settings/connections">Import from Google</Link>
            </Button>
            <Button asChild>
              <Link href="/settings/connections#files">Import calendar file</Link>
            </Button>
          </>
        }
      />

      <Section title="Next 30 days">
        {upcoming.length ? (
          <ul className="list" aria-label="Next 30 days">
            {upcoming.slice(0, 40).map((u) => {
              const s = seriesById.get(u.eventId);
              return (
                <EventRow
                  key={`${u.eventId}:${u.occurrenceOn}`}
                  href={`/rooms/${u.eventId}`}
                  date={u.date}
                  title={u.title}
                  lines={[
                    [DOW[ymd(u.date).getUTCDay()], u.time ? formatTime(u.time) : "All day", u.localTimeLabel ? `(${u.localTimeLabel})` : null, u.location].filter(Boolean).join(" · "),
                    u.people ? `${people(u.people)} linked` : null,
                  ]}
                  end={
                    <>
                      <Mono>{kindLabel(u.kind)}</Mono>
                      {s ? <span className="font-mono text-[12px] text-faint">{recurrenceLabel(s.recurrence)}</span> : null}
                    </>
                  }
                />
              );
            })}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-line bg-sunk p-3.5 text-[14.5px] text-muted">
            {data.spaceName ? `Nothing scheduled in ${data.spaceName}. ` : "Nothing scheduled. "}Add an event, set a recurring commitment, or import your calendar.
          </p>
        )}
      </Section>

      <section id="radar" aria-label="Radar" className="grid scroll-mt-20 content-start gap-3 pt-[22px] pb-1.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2>Radar</h2>
          {radarSpace ? (
            <AiJobButton aiEnabled={aiEnabled} variant={radar ? "secondary" : "primary"} size="md" job={{ kind: "radar", spaceId: radarSpace.id }} label={radar ? "Refresh radar" : "Scan for this week"} />
          ) : null}
        </div>
        <p className="text-[14.5px] text-muted">Rooms worth your time in the next three weeks, matched to your goals and where your network already gathers.</p>
        {radar && radarResult ? (
          <>
            <p className="hint">
              Scanned {formatLongDate(radarResult.from, today)} for the three weeks to {formatLongDate(radarResult.to, today)}.
            </p>
            <RoomIdeas searchId={radar.id} items={radarResult.items} />
          </>
        ) : null}
      </section>

      <Section title="Recurring">
        {series.length ? (
          <ul className="list" aria-label="Recurring">
            {series.map((s) => (
              <EventRow
                key={s.id}
                href={`/rooms/${s.id}`}
                date={s.next}
                title={s.title}
                lines={[
                  `${recurrenceLabel(s.recurrence)}${s.next ? ` · next ${formatLongDate(s.next, today)}` : ""}`,
                  [s.pastCount ? `Attended ${s.attended} of the last ${s.pastCount}` : "No past sessions yet", impactLabel(s.id)].filter(Boolean).join(" · "),
                ]}
                end={<span className="font-mono text-[12px] text-faint">{people(s.people)}</span>}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-line bg-sunk p-3.5 text-[14.5px] text-muted">
            No recurring commitments. Board dinners, club meetups and roundtables go here so you can track attendance and who you see there.
          </p>
        )}
      </Section>

      <Section title="Where your network gathers">
        {gathers.length ? (
          <ul className="grid gap-2" aria-label="Where your network gathers">
            {gathers.map((g) => (
              <li key={g.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <span className="grid gap-1">
                  <span className="truncate text-[14px]">{g.label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-sunk" aria-hidden>
                    <i className="block h-full rounded-full bg-accent" style={{ width: `${Math.round((g.n / gathers[0].n) * 100)}%` }} />
                  </span>
                </span>
                <b className="font-mono text-[13px] tabular-nums">{g.n}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14.5px] text-muted">Add &ldquo;where you met&rdquo; to people and the places that keep paying off show up here.</p>
        )}
      </Section>

      {past.length ? (
        <details className="group pt-[22px]">
          <summary className="cursor-pointer list-none font-display text-[19px] font-[680] [&::-webkit-details-marker]:hidden">
            Past <span className="count ml-2">{past.length}</span>
          </summary>
          <ul className="list mt-3" aria-label="Past">
            {past.map((p) => (
              <EventRow
                key={p.id}
                href={`/rooms/${p.id}`}
                date={p.date}
                title={p.title}
                lines={[[formatLongDate(p.date, today), p.location].filter(Boolean).join(" · "), [p.people ? people(p.people) : null, impactLabel(p.id)].filter(Boolean).join(" · ")]}
                end={<Mono>{kindLabel(p.kind)}</Mono>}
              />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
