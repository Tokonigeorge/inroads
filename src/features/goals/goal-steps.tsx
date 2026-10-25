"use client";

import { X } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { formatLongDate } from "@/domain/dates";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { addGoalStepAction, deleteGoalStepAction, setGoalStepDoneAction } from "./actions";

export type StepView = { id: string; text: string; dueOn: string | null; done: boolean; fromPrep: boolean };

/** A goal's concrete next steps: tick them off, add one, or remove one. */
export function GoalSteps({ goalId, steps, today }: { goalId: string; steps: StepView[]; today: string }) {
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
              <span className="grid min-w-0 flex-1">
                <span className={s.done ? "text-muted line-through" : undefined}>{s.text}</span>
                <span className="text-small text-muted">
                  {[s.dueOn ? `${s.dueOn < today && !s.done ? "Overdue · " : ""}by ${formatLongDate(s.dueOn, today)}` : null, s.fromPrep ? "from a room's plan" : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
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
