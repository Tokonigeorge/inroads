"use client";

import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useId, useState } from "react";
import type { PersonListItem } from "@/server/repos/people";
import { Input } from "@/ui/field";
import { Avatar } from "@/ui/list-row";
import type { PickedPerson } from "./capture-forms";

export async function fetchPeople(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
  const res = await fetch(`/api/v1/people?${qs}`);
  if (!res.ok) throw new Error("Couldn't load people");
  return (await res.json()) as { items: PersonListItem[]; nextCursor: string | null };
}

/** Type a name, pick a person. Used by capture when you start from nothing. */
export function PersonPicker({ onPick, spaceId }: { onPick: (p: PickedPerson) => void; spaceId?: string | null }) {
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q.trim());
  const listId = useId();
  const { data, isFetching, isError } = useQuery({
    queryKey: ["people", "picker", deferred, spaceId ?? null],
    queryFn: () => fetchPeople({ q: deferred, spaceId: spaceId ?? undefined, limit: "8", sort: deferred ? "name" : "recent" }),
  });
  return (
    <div className="grid gap-2">
      <Input
        autoFocus
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Who was it?"
        aria-label="Search people"
        aria-controls={listId}
        autoComplete="off"
      />
      <ul id={listId} className="-mx-1 grid" aria-busy={isFetching}>
        {data?.items.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick({ id: p.id, name: p.name, spaces: p.spaces })}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-sunken"
            >
              <Avatar name={p.name} size={32} />
              <span className="grid min-w-0">
                <span className="truncate font-[550]">{p.name}</span>
                <span className="truncate text-small text-muted">{[p.position, p.company].filter(Boolean).join(" · ") || p.spaces.map((s) => s.name).join(", ")}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {data && !data.items.length ? <p className="text-small text-muted">{deferred ? `No one called "${deferred}".` : "No people yet."}</p> : null}
      {isError ? <p className="text-small text-danger">Couldn&apos;t search right now. Check your connection.</p> : null}
    </div>
  );
}
