"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/ui/button";
import { hideRoomIdeaAction } from "./actions";

export type RoomIdea = { id: string; title: string; kind: string; date: string; time: string; timing: string; where: string; why: string; who: string; url: string; howToFind: string; confidence: string };

const confidenceLabel: Record<string, string> = { confirmed: "Date confirmed", recurring: "Recurring", idea: "Idea" };

export function RoomIdeas({ searchId, items }: { searchId: string; items: RoomIdea[] }) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [, start] = useTransition();
  const visible = items.filter((i) => !hidden.has(i.id));
  if (!visible.length) return <p className="text-muted">Nothing left on this list. Find rooms again for fresh ideas.</p>;
  return (
    <ul className="grid gap-3">
      {visible.map((i) => {
        const q = new URLSearchParams({ title: i.title, ...(i.date ? { date: i.date } : {}), ...(i.time ? { time: i.time } : {}), ...(i.where ? { location: i.where } : {}), ...(i.url ? { url: i.url } : {}), notes: [i.why, i.who && `Who: ${i.who}`].filter(Boolean).join("\n") });
        return (
          <li key={i.id}>
            <article aria-label={i.title} className="grid gap-2 rounded-md border border-border bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{i.url ? <a href={i.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{i.title}</a> : i.title}</h3>
                <span className="text-small text-muted">{confidenceLabel[i.confidence] ?? i.confidence}</span>
              </div>
              <p className="text-small text-muted">{[i.date || i.timing, i.time, i.where].filter(Boolean).join(" · ")}</p>
              {i.why ? <p className="text-small">{i.why}</p> : null}
              {i.who ? <p className="text-small text-muted">You&apos;d meet: {i.who}</p> : null}
              {!i.date && i.howToFind ? <p className="text-small text-muted">Next date: {i.howToFind}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={`/rooms/new?${q}`}>Add as a room</Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setHidden((h) => new Set(h).add(i.id));
                    start(() => hideRoomIdeaAction(searchId, i.id));
                  }}
                >
                  Hide
                </Button>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
