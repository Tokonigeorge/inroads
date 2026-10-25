"use client";

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

/** Save someone the plan named: onto a goal (and the room, for a room's prep). */
export function KeepPerson({ searchId, index, name, goals, keptId }: { searchId: string; index: number; name: string; goals: Goal[]; keptId: string | null }) {
  const [goalId, setGoalId] = useState(goals[0]?.id ?? "");
  const [pending, start] = useTransition();
  const toast = useToast();
  if (keptId) {
    return (
      <Link href={`/people/${keptId}`} className="text-small font-[550] text-accent hover:underline">
        In your people
      </Link>
    );
  }
  if (!name) return <span className="text-small text-muted">A role to look for, not a name yet</span>;
  const goal = goals.find((g) => g.id === goalId);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <GoalPick goals={goals} value={goalId} onChange={setGoalId} label={`Goal for ${name}`} />
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await keepStakeholderAction(searchId, index, goal?.id ?? null);
            toast.show(r.ok ? (goal ? `${name} added to "${goal.text}". Researching them now.` : `${name} saved. Researching them now.`) : (r.message ?? "That didn't save."));
          })
        }
      >
        {goal ? (goals.length > 1 ? "Add" : `Add to ${goal.text.length > 28 ? "goal" : `"${goal.text}"`}`) : `Save ${name.split(/\s+/)[0]}`}
      </Button>
    </div>
  );
}

/** Turn an opening's first move into a step on a goal. */
export function KeepStep({ searchId, index, goals, suggestedGoalId, kept }: { searchId: string; index: number; goals: Goal[]; suggestedGoalId: string | null; kept: boolean }) {
  const [goalId, setGoalId] = useState(suggestedGoalId ?? goals[0]?.id ?? "");
  const [done, setDone] = useState(kept);
  const [pending, start] = useTransition();
  const toast = useToast();
  if (done) return <span className="text-small font-[550] text-muted">Added as a step</span>;
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
        Add as a step
      </Button>
    </div>
  );
}
