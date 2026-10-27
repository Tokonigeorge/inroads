"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { formatLongDate } from "@/domain/dates";
import { AiJobButton } from "@/features/ai/ai-job-button";
import { JobStatus } from "@/features/ai/job-status";
import { PlanPeople } from "@/features/ai/plan-actions";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { addGoalStepAction, deleteGoalStepAction, setGoalStepDoneAction } from "./actions";

/** A research step's state: still searching, what it found (and who's already added), or not run yet. */
export type StepResearch = {
  jobId: string | null;
  searchId: string | null;
  people: { index: number; name: string; role: string; why: string; url: string }[];
  kept: Record<number, string>;
};

export type StepView = { id: string; text: string; dueOn: string | null; done: boolean; fromPrep: boolean; research: StepResearch | null };

/**
 * Under a "Find …" step: Inroads searches the web for named people or firms who fit, and you add
 * the right ones to the goal. Searching your own network is one tap away too.
 */
function StepResearchPanel({ step, goal, aiEnabled }: { step: StepView; goal: { id: string; text: string }; aiEnabled: boolean }) {
  const r = step.research!;
  const ask = `/ask?q=${encodeURIComponent(`Who do I know who could help me ${step.text.charAt(0).toLowerCase()}${step.text.slice(1)}?`)}`;
  if (r.jobId) return <JobStatus jobId={r.jobId} />;
  return (
    <div className="grid gap-2 rounded-md border border-line bg-surface p-3">
      {r.searchId ? (
        r.people.length ? (
          <PlanPeople searchId={r.searchId} people={r.people} goals={[goal]} kept={r.kept} />
        ) : (
          <p className="text-small text-muted">The web search didn&apos;t turn up names this time. Try again later, or look among the people you know.</p>
        )
      ) : (
        <p className="text-small text-muted">Inroads can search the web for people and firms near you who fit this step. You choose who to add to the goal.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <AiJobButton aiEnabled={aiEnabled} job={{ kind: "find", stepId: step.id }} variant={r.searchId ? "ghost" : "primary"} label={r.searchId ? "Search again" : "Find people for this"} />
        <Link href={ask} className="inline-flex items-center gap-1 text-small font-[550] text-accent hover:underline">
          <Search size={14} aria-hidden /> Check your network
        </Link>
      </div>
    </div>
  );
}

/** A goal's concrete next steps: tick them off, add one, or remove one. "Find …" steps are research steps. */
export function GoalSteps({ goalId, goalText, steps, today, aiEnabled }: { goalId: string; goalText: string; steps: StepView[]; today: string; aiEnabled: boolean }) {
  const [text, setText] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  function add(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return setMessage("Write the step.");
    start(async () => {
      const r = await addGoalStepAction(goalId, text.trim(), dueOn || null);
      if (!r.ok) return setMessage(r.message ?? "That didn't save.");
      setText("");
      setDueOn("");
      setMessage(null);
    });
  }

  return (
    <div className="grid gap-3">
      {steps.length ? (
        <ul className="grid gap-1">
          {steps.map((s) => (
            <li key={s.id} className="group flex items-start gap-3 rounded-md py-1.5">
              <input
                type="checkbox"
                checked={s.done}
                aria-label={`${s.done ? "Not done" : "Done"}: ${s.text}`}
                onChange={(e) => start(() => setGoalStepDoneAction(s.id, e.target.checked))}
                className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
              />
              <div className="grid min-w-0 flex-1">
                <span className={s.done ? "text-muted line-through" : undefined}>{s.text}</span>
                <span className="text-small text-muted">
                  {[s.dueOn ? `${s.dueOn < today && !s.done ? "Overdue · " : ""}by ${formatLongDate(s.dueOn, today)}` : null, s.fromPrep ? "from a room's plan" : null, s.research ? "research step" : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {s.research && !s.done ? (
                  <div className="mt-2">
                    <StepResearchPanel step={s} goal={{ id: goalId, text: goalText }} aiEnabled={aiEnabled} />
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                aria-label={`Remove: ${s.text}`}
                onClick={() =>
                  start(async () => {
                    await deleteGoalStepAction(s.id);
                    toast.show("Step removed.");
                  })
                }
                className="rounded-sm p-1 text-muted opacity-60 hover:text-text hover:opacity-100"
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-muted">Concrete things to do for this goal. Prepare a room and its first moves can land here in one tap.</p>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2" aria-label="Add a step" noValidate>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Email Kemi the deck"
          aria-label="New step"
          maxLength={300}
          autoComplete="off"
          className="min-w-0 flex-1 basis-56"
        />
        <Input type="date" value={dueOn} min={today} onChange={(e) => setDueOn(e.target.value)} aria-label="Due (optional)" className="w-auto" />
        <Button type="submit" size="md" disabled={pending}>
          Add step
        </Button>
      </form>
      {message ? (
        <p role="alert" className="text-small text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
