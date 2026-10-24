"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, useTransition } from "react";
import { triageActionLabels, triageActions } from "@/contracts/connections";
import { cadenceChoices } from "@/contracts/spaces";
import type { TriageAction } from "@/domain/triage";
import { acceptSuggestedSortAction, decideTriageAction } from "@/features/connections/actions";
import { Button } from "@/ui/button";
import { Select } from "@/ui/field";
import { Avatar } from "@/ui/list-row";
import { useToast } from "@/ui/toast";
import { useShortcut } from "@/ui/use-shortcut";

export type TriageCard = {
  membershipId: string;
  name: string;
  detail: string;
  contact: string;
  spaceName: string;
  suggestion: { action: TriageAction; reason: string } | null;
};

type Props = {
  items: TriageCard[];
  total: number;
  byAction: Record<TriageAction, number>;
  spaceId: string | null;
  showSpaces: boolean;
};

const n = (x: number) => x.toLocaleString("en-GB");
const people = (x: number) => `${n(x)} ${x === 1 ? "person" : "people"}`;

/**
 * Sorting people who arrived from an import. Everyone has a suggestion; one button accepts them
 * all, or go through one at a time. Nothing is decided without the user (brief §2).
 */
export function TriageQueue({ items, total, byAction, spaceId, showSpaces }: Props) {
  const [decided, setDecided] = useState<Set<string>>(() => new Set());
  const [cadence, setCadence] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const toast = useToast();
  const queryClient = useQueryClient();
  const queue = items.filter((i) => !decided.has(i.membershipId));
  const current = queue[0];
  // Each decision refreshes the page's data, so `total` already excludes people sorted earlier.
  const remaining = total - items.filter((i) => decided.has(i.membershipId)).length;

  const decide = (item: TriageCard, action: TriageAction) => {
    setDecided((s) => new Set(s).add(item.membershipId));
    const c = cadence[item.membershipId];
    start(async () => {
      try {
        await decideTriageAction([{ membershipId: item.membershipId, action, ...(c && c !== "space" ? { cadenceDays: c === "none" ? null : Number(c) } : {}) }]);
        void queryClient.invalidateQueries({ queryKey: ["people"] });
      } catch {
        setDecided((s) => {
          const next = new Set(s);
          next.delete(item.membershipId);
          return next;
        });
        toast.show(`Couldn't sort ${item.name}. Try again.`);
      }
    });
  };

  useShortcut("1", () => current && decide(current, "priority"), Boolean(current));
  useShortcut("2", () => current && decide(current, "keep"), Boolean(current));
  useShortcut("3", () => current && decide(current, "not_now"), Boolean(current));

  if (remaining <= 0) {
    return (
      <div className="grid gap-3">
        <p>Everyone is sorted.</p>
        <div>
          <Button asChild variant="primary">
            <Link href="/people">Go to people</Link>
          </Button>
        </div>
      </div>
    );
  }

  const suggested = [
    byAction.priority ? `${n(byAction.priority)} priority` : null,
    byAction.keep ? `${n(byAction.keep)} keep` : null,
    byAction.not_now ? `${n(byAction.not_now)} not now` : null,
  ].filter(Boolean);

  return (
    <div className="grid gap-8">
      <section className="grid gap-3 rounded-md border border-border bg-surface p-4">
        <p>
          Suggested: {suggested.join(", ")}. Priority people are starred and get reminders, Not now are archived and still searchable.
        </p>
        <div>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await acceptSuggestedSortAction(spaceId);
                const done = Object.values(r).reduce((a, b) => a + (b ?? 0), 0);
                setDecided(new Set(items.map((i) => i.membershipId)));
                void queryClient.invalidateQueries({ queryKey: ["people"] });
                toast.show(`Sorted ${people(done)}.`);
              })
            }
          >
            Use suggested sort for {people(remaining)}
          </Button>
        </div>
      </section>

      {current ? (
        <section aria-labelledby="triage-current" className="grid gap-4">
          <h2 id="triage-current" className="text-title font-semibold">
            Or one at a time <span className="font-normal text-muted">· {n(remaining)} left</span>
          </h2>
          <article className="grid gap-4 rounded-md border border-border p-4">
            <div className="flex items-start gap-3">
              <Avatar name={current.name} />
              <div className="min-w-0">
                <p className="text-title font-semibold">{current.name}</p>
                {current.detail ? <p className="text-muted">{current.detail}</p> : null}
                {current.contact ? <p className="text-small text-muted">{current.contact}</p> : null}
                {showSpaces ? <p className="text-small text-muted">{current.spaceName}</p> : null}
              </div>
            </div>
            {current.suggestion ? (
              <p className="text-small">
                <span className="font-[550]">Suggested: {triageActionLabels[current.suggestion.action]}.</span>{" "}
                <span className="text-muted">{current.suggestion.reason}</span>
              </p>
            ) : null}
            <label className="grid max-w-[260px] gap-1.5 text-small font-[550]">
              Reminder
              <Select
                value={cadence[current.membershipId] ?? "space"}
                onChange={(e) => setCadence((c) => ({ ...c, [current.membershipId]: e.target.value }))}
              >
                <option value="space">Space default</option>
                {cadenceChoices.map((c) => (
                  <option key={c.days ?? "none"} value={c.days ?? "none"}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex flex-wrap gap-2">
              {triageActions.map((a) => (
                <Button key={a} variant={current.suggestion?.action === a ? "primary" : "secondary"} onClick={() => decide(current, a)}>
                  {triageActionLabels[a]}
                </Button>
              ))}
            </div>
            <p className="hidden text-small text-muted md:block">Keys: 1 priority, 2 keep, 3 not now.</p>
          </article>
          {queue.length > 1 ? (
            <ul aria-label="Up next" className="grid gap-1 text-small text-muted">
              {queue.slice(1, 6).map((i) => (
                <li key={i.membershipId}>
                  {i.name}
                  {i.suggestion ? ` · ${triageActionLabels[i.suggestion.action]}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : (
        <p className="text-muted">Loading the next people…</p>
      )}
    </div>
  );
}
