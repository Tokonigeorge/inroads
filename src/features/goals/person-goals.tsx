"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Stage } from "@/contracts/spaces";
import { Button } from "@/ui/button";
import { Select } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { addPeopleToGoalAction, moveStageAction } from "./actions";

export type PersonGoalLink = { linkId: string; goalId: string; goalText: string; stage: string; stages: Stage[] };
export type GoalOption = { id: string; text: string; spaceName: string };

/** A person's goals with their stage, and adding them to another goal. Only by explicit choice. */
export function PersonGoals({ personId, personName, links, options, showSpaces }: { personId: string; personName: string; links: PersonGoalLink[]; options: GoalOption[]; showSpaces: boolean }) {
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState("");
  const toast = useToast();
  return (
    <div className="grid gap-4">
      {links.length ? (
        <ul className="grid gap-2">
          {links.map((l) => (
            <li key={l.linkId} className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/goals/${l.goalId}`} className="min-w-0 hover:underline">
                {l.goalText}
              </Link>
              <Select
                aria-label={`Stage for ${personName} in ${l.goalText}`}
                defaultValue={l.stage}
                onChange={(e) =>
                  start(async () => {
                    const r = await moveStageAction(l.linkId, e.target.value);
                    if (r.message) toast.show(r.message);
                  })
                }
                className="h-9 w-auto min-w-40 text-small md:text-small"
              >
                {l.stages.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-muted">Not on any goals yet.</p>
      )}
      {options.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Choose a goal" value={choice} onChange={(e) => setChoice(e.target.value)} className="h-9 w-auto min-w-48 text-small md:text-small">
            <option value="">Choose a goal…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {showSpaces ? `${o.text} (${o.spaceName})` : o.text}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            disabled={!choice || pending}
            onClick={() =>
              start(async () => {
                const r = await addPeopleToGoalAction(choice, [personId]);
                if (r.message) return toast.show(r.message);
                toast.show(`Added to ${options.find((o) => o.id === choice)?.text ?? "the goal"}.`);
                setChoice("");
              })
            }
          >
            Add to goal
          </Button>
        </div>
      ) : null}
    </div>
  );
}
