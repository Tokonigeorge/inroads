"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import { peopleFilterLabels, peopleSortLabels, type PeopleFilter, type PeopleSort } from "@/contracts/people";
import { warmth } from "@/domain/relationship";
import { useCapture } from "@/features/shell/capture-sheet";
import type { PersonListItem } from "@/server/repos/people";
import { Button } from "@/ui/button";
import { Input, Select } from "@/ui/field";
import { Avatar } from "@/ui/list-row";
import { useShortcut } from "@/ui/use-shortcut";
import { WarmthLegend } from "@/ui/warmth";
import { fetchPeople } from "./person-picker";

type Props = {
  today: string;
  spaceId: string | null;
  spaceName: string | null;
  showSpaces: boolean;
  tags: string[];
  circles: { id: string; name: string }[];
  /** People from imports waiting to be sorted. */
  toSort: number;
  /** Possible duplicates from imports, waiting for review. */
  duplicates: number;
  total: number;
};

const ROW = 68;
/** The prototype's sorts (L855), plus "Last spoken to". */
const sorts: PeopleSort[] = ["priority", "added", "due", "name", "recent"];
/** The prototype's chips (L854), then the app's own filters at the end. */
const chipFilters: PeopleFilter[] = ["all", "starred", "due", "context", "no_dossier", "untouched", "unsorted", "archived"];

function Row({ p, today, showSpaces }: { p: PersonListItem; today: string; showSpaces: boolean }) {
  const w = warmth(p.lastTouchedOn, today);
  const role = [p.position, p.company].filter(Boolean).join(" · ") || (showSpaces ? p.spaces.map((s) => s.name).join(", ") : "No role added yet");
  return (
    <Link href={`/people/${p.id}`} className="row h-full">
      <Avatar name={p.name} size={42} warmth={w.key} />
      <span className="grid min-w-0 gap-px">
        <span className="row-name">
          {p.starred ? (
            <>
              <span aria-hidden>★ </span>
              <span className="sr-only">Priority: </span>
            </>
          ) : null}
          {p.name}
        </span>
        <span className="row-sub">{role}</span>
        {p.whereMet ? <span className="row-sub">Met: {p.whereMet}</span> : null}
      </span>
      <span className="grid justify-items-end gap-1">
        {p.score != null ? (
          <span
            title="Goal-fit score"
            aria-label={`Fit ${p.score} out of 100`}
            className={`rounded-[7px] border px-[7px] py-[5px] font-mono text-[12.5px] leading-none font-semibold tabular-nums ${p.score >= 70 ? "border-transparent bg-accent-soft text-accent" : "border-line bg-sunk text-muted"}`}
          >
            {p.score}
          </span>
        ) : null}
        <span className="font-mono text-[12px] leading-none text-faint">{w.days != null ? `${w.days}d` : "new"}</span>
      </span>
    </Link>
  );
}

/**
 * The prototype's People tab (L850–894): five ways in, search and sort, filter chips, and one
 * card of rows with warmth rings and fit scores. Virtualised and keyset-paged, so 10,000+ people
 * scroll smoothly.
 */
export function PeopleList({ today, spaceId, spaceName, showSpaces, tags, circles, toSort, duplicates, total }: Props) {
  const capture = useCapture();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<PeopleFilter>("all");
  const [sort, setSort] = useState<PeopleSort>("priority");
  const [group, setGroup] = useState(""); // "tag:x" | "circle:id"
  const [cursor, setCursor] = useState(-1);
  const deferredQ = useDeferredValue(q.trim());
  const search = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [margin, setMargin] = useState(0);

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

  const hasItems = items.length > 0;
  // Where the list starts on the page, so the window virtualiser knows what's above it.
  useLayoutEffect(() => {
    setMargin(listRef.current ? listRef.current.getBoundingClientRect().top + window.scrollY : 0);
  }, [hasItems]);
  const virtualizer = useWindowVirtualizer({
    count: items.length + (query.hasNextPage ? 1 : 0),
    estimateSize: () => ROW,
    overscan: 8,
    scrollMargin: margin,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems.at(-1)?.index ?? 0;
  useEffect(() => {
    if (lastIndex >= items.length - 1 && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [lastIndex, items.length, query]);

  // Keyboard: / to search, j/k to move, Enter to open.
  useShortcut("/", () => search.current?.focus());
  const move = (d: 1 | -1) => {
    const next = Math.max(0, Math.min(items.length - 1, cursor + d));
    if (!items[next]) return;
    setCursor(next);
    virtualizer.scrollToIndex(next, { align: "auto" });
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLAnchorElement>(`[data-index="${next}"] a`)?.focus());
  };
  useShortcut("j", () => move(1));
  useShortcut("k", () => move(-1));

  const filtered = Boolean(deferredQ || filter !== "all" || group);
  const emptyText = filtered
    ? "No one matches. Try a different search or filter."
    : spaceName && total
      ? `No one in ${spaceName} yet. Add someone to get started.`
      : "No one here yet. Add someone you met recently, import your phone contacts (.vcf) or LinkedIn connections (.csv), or load the example network from the Goals tab.";

  return (
    <div className="grid gap-3 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="primary">
          <Link href="/people/new">+ Add person</Link>
        </Button>
        <Button asChild>
          <Link href="/settings/connections">Import from Google</Link>
        </Button>
        <Button onClick={() => capture.open({ mode: "card" })}>Scan a business card</Button>
        <Button asChild>
          <Link href="/settings/connections#files">Import contacts</Link>
        </Button>
        <Button onClick={() => capture.open({ mode: "chat" })}>Import a chat</Button>
      </div>
      {toSort > 0 || duplicates > 0 ? (
        <div className="grid gap-2">
          {toSort > 0 ? (
            <Link href="/sort" className="flex items-center justify-between rounded-md bg-accent-soft px-3.5 py-2.5 text-[14px] font-semibold text-accent hover:underline">
              Sort {toSort.toLocaleString("en-GB")} new {toSort === 1 ? "person" : "people"}
              <span aria-hidden>→</span>
            </Link>
          ) : null}
          {duplicates > 0 ? (
            <Link href="/duplicates" className="flex items-center justify-between rounded-md border border-line bg-surface px-3.5 py-2.5 text-[14px] font-semibold hover:bg-sunk">
              Review {duplicates.toLocaleString("en-GB")} possible {duplicates === 1 ? "duplicate" : "duplicates"}
              <span aria-hidden>→</span>
            </Link>
          ) : null}
        </div>
      ) : null}
      <Link href="/ask" className="justify-self-start text-[14px] font-semibold text-accent hover:underline">
        Ask your network a question
      </Link>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input
          ref={search}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, company, where you met…"
          aria-label="Search people"
          autoComplete="off"
        />
        <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as PeopleSort)} className="w-auto">
          {sorts.map((s) => (
            <option key={s} value={s}>
              {peopleSortLabels[s]}
            </option>
          ))}
        </Select>
      </div>
      <div className="chips" role="group" aria-label="Filter">
        {chipFilters.map((f) => (
          <button
            key={f}
            type="button"
            className="chip"
            aria-pressed={filter === f && !group}
            onClick={() => {
              setFilter(f);
              setGroup("");
            }}
          >
            {peopleFilterLabels[f]}
          </button>
        ))}
        {circles.map((c) => (
          <button key={c.id} type="button" className="chip" aria-pressed={group === `circle:${c.id}`} onClick={() => setGroup(group === `circle:${c.id}` ? "" : `circle:${c.id}`)}>
            {c.name}
          </button>
        ))}
        {tags.map((t) => (
          <button key={t} type="button" className="chip" aria-pressed={group === `tag:${t}`} onClick={() => setGroup(group === `tag:${t}` ? "" : `tag:${t}`)}>
            #{t}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="grid gap-2" aria-label="Loading" role="status">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="shimmer h-14 rounded-md" />
          ))}
        </div>
      ) : query.isError ? (
        <p className="rounded-md border border-dashed border-line bg-sunk p-3.5 text-muted">Couldn&apos;t load people. Check your connection, then try again.</p>
      ) : !items.length ? (
        <p className="rounded-md border border-dashed border-line bg-sunk p-3.5 text-[14.5px] text-muted">{emptyText}</p>
      ) : (
        <ul ref={listRef} aria-label={spaceName ? `People in ${spaceName}` : "People"} className="list relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualItems.map((v) => {
            const p = items[v.index];
            const style = { position: "absolute", top: v.start - virtualizer.options.scrollMargin, height: ROW, left: 0, right: 0 } as const;
            if (!p) {
              return (
                <li key="more" style={style} className="px-3.5 py-3 text-[13.5px] text-muted">
                  Loading more…
                </li>
              );
            }
            return (
              <li key={p.id} data-index={v.index} style={style} className={v.index ? "border-t border-line" : ""} onFocus={() => setCursor(v.index)}>
                <Row p={p} today={today} showSpaces={showSpaces} />
              </li>
            );
          })}
        </ul>
      )}
      <WarmthLegend />
      <p className="sr-only" aria-live="polite">
        {!query.isLoading && filtered ? `${items.length}${query.hasNextPage ? "+" : ""} people` : ""}
      </p>
    </div>
  );
}
