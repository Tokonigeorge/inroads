"use client";

import { useEffect, useState } from "react";
import { Button } from "@/ui/button";

export type WeekGoal = { id: string; text: string; done: number; target: number };

const COLOURS = ["var(--accent)", "var(--good)", "var(--warm)", "var(--fresh)", "var(--hot)", "var(--cool)"];
const seenKey = (goalId: string, week: string) => `inroads:week-done:${goalId}:${week}`;

function seen(goalId: string, week: string) {
  try {
    return window.localStorage.getItem(seenKey(goalId, week)) === "1";
  } catch {
    // No storage (private mode): celebrate, but at most once per page view.
    return false;
  }
}

function markSeen(goalId: string, week: string) {
  try {
    window.localStorage.setItem(seenKey(goalId, week), "1");
  } catch {
    // Nothing to remember it in; harmless.
  }
}

/**
 * When a goal's weekly target is met: a short confetti burst and a card saying so, once per goal
 * per week (remembered on this device). Several at once are celebrated together. Reduced motion
 * keeps the card and skips the confetti.
 */
export function WeekCelebration({ goals, week }: { goals: WeekGoal[]; week: string }) {
  const [hit, setHit] = useState<WeekGoal[]>([]);
  // The page re-renders with a new array after any save; only a change in the numbers matters.
  const key = goals.map((g) => `${g.id}:${g.done}/${g.target}`).join(",");
  useEffect(() => {
    const fresh = goals.filter((g) => g.done >= g.target && g.target > 0 && !seen(g.id, week));
    if (!fresh.length) return;
    const show = requestAnimationFrame(() => {
      for (const g of fresh) markSeen(g.id, week);
      setHit(fresh);
    });
    return () => cancelAnimationFrame(show);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `goals`.
  }, [key, week]);
  useEffect(() => {
    if (!hit.length) return;
    const hide = window.setTimeout(() => setHit([]), 9000);
    return () => window.clearTimeout(hide);
  }, [hit]);

  if (!hit.length) return null;
  const one = hit.length === 1 ? hit[0] : null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 min-[900px]:bottom-8">
      <div className="pop pointer-events-auto relative w-full max-w-[420px] rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow)]">
        <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2">
          {Array.from({ length: 28 }, (_, i) => {
            const angle = (i / 28) * 2 * Math.PI + (i % 3) * 0.2;
            const dist = 90 + ((i * 37) % 70);
            return (
              <span
                key={i}
                className="confetti absolute block h-2.5 w-1.5 rounded-[2px]"
                style={{
                  background: COLOURS[i % COLOURS.length],
                  ["--x" as string]: `${Math.cos(angle) * dist}px`,
                  ["--y" as string]: `${Math.sin(angle) * dist + 40}px`,
                  ["--r" as string]: `${(i % 2 ? 1 : -1) * (180 + i * 23)}deg`,
                  animationDelay: `${(i % 5) * 25}ms`,
                }}
              />
            );
          })}
        </div>
        <p className="font-display text-[18px] font-[700]">🎉 Week done{one ? "" : ` on ${hit.length} goals`}!</p>
        <p className="mt-1 text-[14.5px] text-muted">
          {one
            ? `${one.done} of ${one.target} this week for “${one.text}”. That's the habit that gets you there.`
            : hit.map((g) => `“${g.text}” (${g.done} of ${g.target})`).join(", ") + ". Keep it going."}
        </p>
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => setHit([])}>
            Nice
          </Button>
        </div>
      </div>
    </div>
  );
}
