"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { peopleFilterLabels, peopleFilters, peopleSortLabels, peopleSorts, type PeopleFilter, type PeopleSort } from "@/contracts/people";
import { dueState, warmth } from "@/domain/relationship";
import { useCapture } from "@/features/shell/capture-sheet";
import type { PersonListItem } from "@/server/repos/people";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Input, Select } from "@/ui/field";
import { Avatar } from "@/ui/list-row";
import { useShortcut } from "@/ui/use-shortcut";
import { WarmthDot } from "@/ui/warmth";
import { fetchPeople } from "./person-picker";

type Props = {
  today: string;
  spaceId: string | null;
  spaceName: string | null;
  showSpaces: boolean;
  tags: string[];
  circles: { id: string; name: string }[];
};

const ROW = 60;

function trailing(p: PersonListItem, today: string) {
  const due = dueState(p.dueOn, today);
  if (due?.due) return <span className="font-[550] text-accent">{due.label}</span>;
  const w = warmth(p.lastTouchedOn, today);
  return (
    <span className="flex items-center gap-1.5">
      <WarmthDot warmth={w} />
      {w.label}
    </span>
  );
}

/** Virtualised, keyset-paged list. Handles 10,000+ people without slowing down. */
export function PeopleList({ today, spaceId, spaceName, showSpaces, tags, circles }: Props) {
  const capture = useCapture();
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<PeopleFilter>("all");
  const [sort, setSort] = useState<PeopleSort>("name");
  const [group, setGroup] = useState(""); // "tag:x" | "circle:id"
  const deferredQ = useDeferredValue(q.trim());
  const search = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const tag = group.startsWith("tag:") ? group.slice(4) : undefined;
  const circleId = group.startsWith("circle:") ? group.slice(7) : undefined;
  const query = useInfiniteQuery({
    queryKey: ["people", "list", { q: deferredQ, filter, sort, spaceId, tag, circleId }],
    queryFn: ({ pageParam }) =>
      fetchPeople({ q: deferredQ, filter, sort, spaceId: spaceId ?? undefined, tag, circleId, cursor: pageParam ?? undefined, limit: "60" }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  // The React Compiler isn't enabled; this hook is used the documented way.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length + (query.hasNextPage ? 1 : 0),
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems.at(-1)?.index ?? 0;
  useEffect(() => {
    if (lastIndex >= items.length - 1 && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [lastIndex, items.length, query]);

  // Keyboard: / to search, j/k to move, Enter (native) to open.
  useShortcut("/", () => search.current?.focus());
  const move = (d: 1 | -1) => {
    const current = items.findIndex((p) => p.id === params.id);
    const next = items[Math.max(0, Math.min(items.length - 1, current + d))];
    if (!next) return;
    virtualizer.scrollToIndex(items.indexOf(next), { align: "auto" });
    router.push(`/people/${next.id}`);
  };
  useShortcut("j", () => move(1));
  useShortcut("k", () => move(-1));

  const emptyText =
    deferredQ || filter !== "all" || group
      ? "No one matches. Try a different search or filter."
      : spaceName
        ? `No one in ${spaceName} yet. Add someone to get started.`
        : "No one here yet. Add the first person you want to keep up with.";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-2 px-4 pt-6 pb-3 md:px-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-[1.5rem] leading-[1.875rem] font-medium">People</h1>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => capture.open({ mode: "touch" })}>
              Log a touch
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/people/new">
                <Plus size={14} aria-hidden /> Add
              </Link>
            </Button>
          </div>
        </div>
        <Input
          ref={search}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, company, where you met…"
          aria-label="Search people"
          autoComplete="off"
        />
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value as PeopleFilter)} className="h-9 text-small md:text-small">
            {peopleFilters.map((f) => (
              <option key={f} value={f}>
                {peopleFilterLabels[f]}
              </option>
            ))}
          </Select>
          <Select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as PeopleSort)} className="h-9 text-small md:text-small">
            {peopleSorts.map((s) => (
              <option key={s} value={s}>
                Sort: {peopleSortLabels[s]}
              </option>
            ))}
          </Select>
        </div>
        {tags.length || circles.length ? (
          <Select aria-label="Circle or tag" value={group} onChange={(e) => setGroup(e.target.value)} className="h-9 text-small md:text-small">
            <option value="">Any circle or tag</option>
            {circles.length ? (
              <optgroup label="Circles">
                {circles.map((c) => (
                  <option key={c.id} value={`circle:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {tags.length ? (
              <optgroup label="Tags">
                {tags.map((t) => (
                  <option key={t} value={`tag:${t}`}>
                    #{t}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
        ) : null}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-busy={query.isLoading}>
        {query.isLoading ? (
          <div className="grid gap-2 px-2" aria-label="Loading">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-12 rounded-md bg-sunken" />
            ))}
          </div>
        ) : query.isError ? (
          <p className="px-2 text-muted">Couldn&apos;t load people. Check your connection, then pull to refresh.</p>
        ) : !items.length ? (
          <p className="px-2 text-muted">{emptyText}</p>
        ) : (
          <ul aria-label={spaceName ? `People in ${spaceName}` : "People"} style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualItems.map((v) => {
              const p = items[v.index];
              if (!p) {
                return (
                  <li key="more" style={{ position: "absolute", top: v.start, height: ROW, left: 0, right: 0 }} className="px-2 py-3 text-small text-muted">
                    Loading more…
                  </li>
                );
              }
              const selected = params.id === p.id;
              return (
                <li key={p.id} style={{ position: "absolute", top: v.start, height: ROW, left: 0, right: 0 }}>
                  <Link
                    href={`/people/${p.id}`}
                    aria-current={selected ? "page" : undefined}
                    className={cn("flex h-full items-center gap-3 rounded-md px-2", selected ? "bg-accent-soft" : "hover:bg-sunken")}
                  >
                    <Avatar name={p.name} />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate font-[550]">
                        {p.name}
                        {p.starred ? <span className="sr-only"> (priority)</span> : null}
                      </span>
                      <span className="truncate text-small text-muted">
                        {[p.position, p.company].filter(Boolean).join(" · ") || (showSpaces ? p.spaces.map((s) => s.name).join(", ") : "No role added yet")}
                      </span>
                    </span>
                    <span className="shrink-0 text-small text-muted">{trailing(p, today)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
