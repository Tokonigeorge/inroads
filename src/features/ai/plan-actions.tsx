"use client";

import { Check, ListPlus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/ui/button";
import { Select } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { keepOpeningAction, keepStakeholderAction } from "./actions";

type Goal = { id: string; text: string };

function GoalPick({ goals, value, onChange, label }: { goals: Goal[]; value: string; onChange: (v: string) => void; label: string }) {
  if (goals.length < 2) return null;
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-auto max-w-[240px] text-small md:text-small">
      {goals.map((g) => (
        <option key={g.id} value={g.id}>
          {g.text}
        </option>
      ))}
    </Select>
  );
}

type Stakeholder = { index: number; name: string; role: string; why: string; url: string };

const short = (text: string) => (text.length > 32 ? `${text.slice(0, 30)}…` : text);

/**
 * The people a plan names, with one choice of goal for all of them (not one per row), a clear
 * button on each and "Add all" for the lot. Kept people link to their page.
 */
export function PlanPeople({ searchId, people, goals, kept }: { searchId: string; people: Stakeholder[]; goals: Goal[]; kept: Record<number, string> }) {
  const [goalId, setGoalId] = useState(goals[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const toast = useToast();
  const goal = goals.find((g) => g.id === goalId);
  const named = people.filter((p) => p.name);
  const left = named.filter((p) => !kept[p.index]);

  const add = (list: Stakeholder[], which: number | "all") =>
    start(async () => {
      setBusy(which);
      let ok = 0;
      let message: string | undefined;
      for (const p of list) {
        const r = await keepStakeholderAction(searchId, p.index, goal?.id ?? null);
        if (r.ok) ok++;
        else message = r.message;
      }
      setBusy(null);
      if (!ok) return toast.show(message ?? "That didn't save.");
      const who = list.length === 1 ? list[0].name : `${ok} people`;
      toast.show(goal ? `${who} added to "${goal.text}". Researching ${ok === 1 ? "them" : "each"} now.` : `${who} saved. Researching ${ok === 1 ? "them" : "each"} now.`);
    });

  return (
    <div className="grid gap-3">
      {left.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-sunken px-3 py-2 text-small">
          {goals.length > 1 ? (
            <>
              <span>Add them to</span>
              <Select aria-label="Goal for people you add" value={goalId} onChange={(e) => setGoalId(e.target.value)} className="h-8 w-auto max-w-[240px] text-small md:text-small">
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.text}
                  </option>
                ))}
              </Select>
            </>
          ) : goal ? (
            <span>
              People you add go onto <span className="font-[550]">&ldquo;{goal.text}&rdquo;</span> and get researched.
            </span>
          ) : (
            <span>People you add are saved and researched. Add a goal to track them against it.</span>
          )}
          {left.length > 1 ? (
            <Button size="sm" variant="primary" className="ml-auto" disabled={pending} onClick={() => add(left, "all")}>
              <UserPlus size={14} aria-hidden /> {busy === "all" ? "Adding…" : `Add all ${left.length}`}
            </Button>
          ) : null}
        </div>
      ) : null}
      <ul className="grid gap-2">
        {people.map((p) => {
          const keptId = kept[p.index];
          return (
            <li key={p.index} className="flex flex-wrap items-start gap-3 rounded-md border border-border p-3 transition-colors hover:border-accent/50">
              <div className="grid min-w-0 flex-1 gap-1">
                <p>
                  <span className="font-[550]">
                    {p.url && p.name ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                        {p.name}
                      </a>
                    ) : (
                      p.name || p.role
                    )}
                  </span>
                  {p.name && p.role ? <span className="text-muted"> · {p.role}</span> : null}
                </p>
                {p.why ? <p className="text-small">{p.why}</p> : null}
              </div>
              <div className="shrink-0">
                {keptId ? (
                  <Link href={`/people/${keptId}`} className="inline-flex items-center gap-1 text-small font-[550] text-accent hover:underline">
                    <Check size={14} aria-hidden /> In your people
                  </Link>
                ) : !p.name ? (
                  <span className="text-small text-muted">A role to look for, not a name yet</span>
                ) : (
                  <Button size="sm" disabled={pending} aria-label={goal ? `Add to "${goal.text}"` : `Save ${p.name}`} title={goal ? `Add ${p.name} to "${goal.text}"` : undefined} onClick={() => add([p], p.index)}>
                    <UserPlus size={14} aria-hidden /> {busy === p.index ? "Adding…" : goal ? `Add to "${short(goal.text)}"` : `Save ${p.name.split(/\s+/)[0]}`}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Turn an opening's first move into a step on a goal. */
export function KeepStep({ searchId, index, goals, suggestedGoalId, kept }: { searchId: string; index: number; goals: Goal[]; suggestedGoalId: string | null; kept: boolean }) {
  const [goalId, setGoalId] = useState(suggestedGoalId ?? goals[0]?.id ?? "");
  const [done, setDone] = useState(kept);
  const [pending, start] = useTransition();
  const toast = useToast();
  if (done)
    return (
      <span className="inline-flex items-center gap-1 text-small font-[550] text-accent">
        <Check size={14} aria-hidden /> Added as a step
      </span>
    );
  if (!goals.length) {
    return (
      <Link href="/goals/new" className="text-small font-[550] text-accent hover:underline">
        Add a goal to track this
      </Link>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <GoalPick goals={goals} value={goalId} onChange={setGoalId} label="Goal for this step" />
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await keepOpeningAction(searchId, index, goalId);
            if (r.ok) setDone(true);
            toast.show(r.ok ? "Added as a step. It shows on the goal and on Today when it's due." : (r.message ?? "That didn't save."));
          })
        }
      >
        <ListPlus size={14} aria-hidden /> Add as a step
      </Button>
    </div>
  );
}
