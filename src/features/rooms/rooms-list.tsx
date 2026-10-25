"use client";

import { Plus, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { roomKindLabels, type RoomKind } from "@/contracts/rooms";
import { addDays, formatLongDate } from "@/domain/dates";
import { recurrenceLabel, type Recurrence } from "@/domain/recurrence";
import { formatTime } from "@/domain/zoned";
import type { UpcomingItem } from "@/server/repos/rooms";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";

type SeriesItem = { id: string; title: string; kind: string; location: string | null; recurrence: Recurrence; next: string | null; pastCount: number; attended: number };
type PastItem = { id: string; title: string; kind: string; location: string | null; date: string; people: number };
type Tab = "upcoming" | "series" | "past";

function dayLabel(date: string, today: string) {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return formatLongDate(date, today);
}

function Row({ href, selected, primary, secondary, trailing }: { href: string; selected: boolean; primary: string; secondary: string; trailing?: string }) {
  return (
    <Link href={href} aria-current={selected ? "page" : undefined} className={cn("flex min-h-14 items-center gap-3 rounded-md px-2 py-2", selected ? "bg-accent-soft" : "hover:bg-sunken")}>
      <span className="grid min-w-0 flex-1">
        <span className="truncate font-[550]">{primary}</span>
        <span className="truncate text-small text-muted">{secondary}</span>
      </span>
      {trailing ? <span className="shrink-0 text-small text-muted">{trailing}</span> : null}
    </Link>
  );
}

type Impact = Record<string, { met: number; inTouchNow: number }>;

/** "Met 6 · 4 in touch": what a room has led to, shown in the Repeating and Past tabs. */
const impactLabel = (i: Impact[string] | undefined) => (i?.met ? `Met ${i.met} · ${i.inTouchNow} in touch` : null);

export function RoomsList({
  today,
  upcoming,
  series,
  past,
  impact = {},
  spaceName,
}: {
  today: string;
  upcoming: UpcomingItem[];
  series: SeriesItem[];
  past: PastItem[];
  impact?: Impact;
  spaceName: string | null;
}) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const params = useParams<{ id?: string }>();
  const groups = new Map<string, UpcomingItem[]>();
  for (const u of upcoming) groups.set(u.date, [...(groups.get(u.date) ?? []), u]);
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "upcoming", label: "Upcoming", count: upcoming.length },
    { key: "series", label: "Repeating", count: series.length },
    { key: "past", label: "Past", count: past.length },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-3 px-4 pt-6 pb-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-[1.5rem] leading-[1.875rem] font-medium">Rooms</h1>
          <Button asChild size="sm">
            <Link href="/rooms/new">
              <Plus size={14} aria-hidden /> Add a room
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="ghost" className="px-2">
            <Link href="/rooms/suggested" title="Events coming up that serve your goals, found on the web">
              <Sparkles size={14} aria-hidden /> Find rooms for my goals
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="px-2">
            <Link href="/rooms/lookup" title="Research an event, company, person or place">
              <Search size={14} aria-hidden /> Look something up
            </Link>
          </Button>
        </div>
        <div role="tablist" aria-label="Rooms" className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn("-mb-px border-b-2 px-2 pb-2 text-small font-[550]", tab === t.key ? "border-accent text-text" : "border-transparent text-muted hover:text-text")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {tab === "upcoming" ? (
          groups.size ? (
            [...groups].map(([date, items]) => (
              <section key={date} className="pb-3">
                <h2 className="px-2 pt-2 pb-1 text-small font-[550] text-muted">{dayLabel(date, today)}</h2>
                <ul>
                  {items.map((u) => (
                    <li key={`${u.eventId}:${u.occurrenceOn}`}>
                      <Row
                        href={`/rooms/${u.eventId}`}
                        selected={params.id === u.eventId}
                        primary={u.title}
                        secondary={[u.time ? formatTime(u.time) : "All day", u.localTimeLabel ? `(${u.localTimeLabel})` : null, u.location].filter(Boolean).join(" · ")}
                        trailing={u.people ? (u.people === 1 ? "1 person" : `${u.people} people`) : undefined}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <p className="px-2 text-muted">{spaceName ? `Nothing coming up in ${spaceName}.` : "Nothing in the next two months."} Add the meetings and events you go to.</p>
          )
        ) : tab === "series" ? (
          series.length ? (
            <ul>
              {series.map((s) => (
                <li key={s.id}>
                  <Row
                    href={`/rooms/${s.id}`}
                    selected={params.id === s.id}
                    primary={s.title}
                    secondary={[recurrenceLabel(s.recurrence), s.next ? `next ${dayLabel(s.next, today).replace(/^Today$/, "today").replace(/^Tomorrow$/, "tomorrow")}` : "ended", impactLabel(impact[s.id])].filter(Boolean).join(" · ")}
                    trailing={s.pastCount ? `Went ${s.attended} of ${s.pastCount}` : undefined}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 text-muted">No repeating rooms. Monthly breakfasts and weekly meetups show here with how often you go.</p>
          )
        ) : past.length ? (
          <ul>
            {past.map((p) => (
              <li key={p.id}>
                <Row
                  href={`/rooms/${p.id}`}
                  selected={params.id === p.id}
                  primary={p.title}
                  secondary={[formatLongDate(p.date, today), roomKindLabels[p.kind as RoomKind] ?? p.kind, impactLabel(impact[p.id])].filter(Boolean).join(" · ")}
                  trailing={p.people ? (p.people === 1 ? "1 person" : `${p.people} people`) : undefined}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 text-muted">No past rooms from the last six months.</p>
        )}
      </div>
    </div>
  );
}
