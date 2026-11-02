"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, useTransition } from "react";
import { triageActionLabels, triageActions } from "@/contracts/connections";
import { cadenceChoices } from "@/contracts/spaces";
import type { RuleOption, SortRule } from "@/domain/sort-rules";
import type { TriageAction } from "@/domain/triage";
import { decideTriageAction, sortByRuleAction } from "@/features/connections/actions";
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
  /** The sort rules that fit these people, with what each would keep. */
  rules: RuleOption[];
  spaceId: string | null;
  showSpaces: boolean;
};

const n = (x: number) => x.toLocaleString("en-GB");
const people = (x: number) => `${n(x)} ${x === 1 ? "person" : "people"}`;

/**
 * Sorting people who arrived from an import. You choose the rule (keep everyone, keep people
 * you've met, …) and see what it does before it runs, or go one at a time. Inroads never sets
 * people aside on its own guess (DECISIONS #192).
 */
export function TriageQueue({ items, total, rules, spaceId, showSpaces }: Props) {
  const [rule, setRule] = useState<SortRule>("everyone");
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

  const chosen = rules.find((r) => r.rule === rule) ?? rules[0];

  return (
    <div className="grid gap-8">
      <section aria-labelledby="sort-how" className="grid gap-3 rounded-md border border-border bg-surface p-4">
        <h2 id="sort-how" className="text-title font-semibold">
          How do you want {people(remaining)} sorted?
        </h2>
        <fieldset className="grid gap-2">
          <legend className="sr-only">Sort rule</legend>
          {rules.map((r) => (
            <label key={r.rule} className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-3 ${rule === r.rule ? "border-accent bg-accent-soft" : "border-border"}`}>
              <input type="radio" name="sort-rule" value={r.rule} checked={rule === r.rule} onChange={() => setRule(r.rule)} className="mt-1 accent-[var(--accent)]" />
              <span className="min-w-0">
                <span className="font-[550]">{r.label}</span>
                <span className="block text-small text-muted">{r.hint}</span>
                <span className="block text-small">
                  {r.setAside ? `${n(r.keep)} on your list, ${n(r.setAside)} set aside` : `All ${n(r.keep)} on your list`}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-small text-muted">Set aside means off your list and out of suggestions, but still in search. Bring anyone back from their page.</p>
        <div>
          <Button
            variant="primary"
            disabled={pending || !chosen}
            onClick={() =>
              start(async () => {
                const r = await sortByRuleAction(spaceId, chosen.rule);
                setDecided(new Set(items.map((i) => i.membershipId)));
                void queryClient.invalidateQueries({ queryKey: ["people"] });
                toast.show(r.setAside ? `${people(r.kept)} on your list, ${n(r.setAside)} set aside.` : `${people(r.kept)} added to your list.`);
              })
            }
          >
            Sort {people(remaining)}
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
            {current.suggestion?.reason ? <p className="text-small text-muted">{current.suggestion.reason}</p> : null}
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
                <Button key={a} variant={a === "keep" ? "primary" : "secondary"} onClick={() => decide(current, a)}>
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
