"use client";

import { useTransition } from "react";
import { setGoalStepDoneAction } from "@/features/goals/actions";
import { useToast } from "@/ui/toast";

/** Tick a goal step off from Today. */
export function StepCheck({ id, text }: { id: string; text: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <input
      type="checkbox"
      disabled={pending}
      aria-label={`Done: ${text}`}
      onChange={() =>
        start(async () => {
          await setGoalStepDoneAction(id, true);
          toast.show("Step done.");
        })
      }
      className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
    />
  );
}
