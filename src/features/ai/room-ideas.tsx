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
  if (!visible.length) return <p className="text-[14px] text-muted">Nothing left on this list. Refresh the radar for fresh ideas.</p>;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-2.5">
      {visible.map((i) => {
        const q = new URLSearchParams({ title: i.title, ...(i.date ? { date: i.date } : {}), ...(i.time ? { time: i.time } : {}), ...(i.where ? { location: i.where } : {}), ...(i.url ? { url: i.url } : {}), notes: [i.why, i.who && `Who: ${i.who}`].filter(Boolean).join("\n") });
        return (
          <li key={i.id} className="grid">
            {/* The prototype's radar card (L941): kind · confidence, title, when and where, why, who's there. */}
            <article aria-label={i.title} className="mini">
              <span className="font-mono text-[11px] tracking-[0.06em] text-faint uppercase">
                {[i.kind, confidenceLabel[i.confidence] ?? i.confidence].filter(Boolean).join(" · ")}
              </span>
              <h3 className="text-[15px] font-semibold">{i.title}</h3>
              <span className="text-[13.5px] text-muted">{[i.date ? [i.date, i.time].filter(Boolean).join(" · ") : i.timing, i.where].filter(Boolean).join(" · ")}</span>
              {i.why ? <p className="text-[14px]">{i.why}</p> : null}
              {i.who ? <p className="text-[14px] text-muted">Who&apos;s there: {i.who}</p> : null}
              {!i.date && i.howToFind ? <p className="text-[14px] text-muted">Find the date: {i.howToFind}</p> : null}
              {i.url ? (
                <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-[13.5px] font-semibold text-accent hover:underline">
                  Open the listing ↗
                </a>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild size="sm">
                  <Link href={`/rooms/new?${q}`}>+ My events</Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/discover?${new URLSearchParams({ q: i.title, type: "event" })}`}>Decode</Link>
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
