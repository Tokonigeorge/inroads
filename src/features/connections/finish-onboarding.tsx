"use client";

import { useTransition } from "react";
import { Button } from "@/ui/button";
import { finishOnboardingAction } from "./actions";

export function FinishOnboarding({ toSort }: { toSort: number }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {toSort > 0 ? (
        <Button variant="primary" disabled={pending} onClick={() => start(() => finishOnboardingAction("/people/triage"))}>
          Sort {toSort.toLocaleString("en-GB")} new {toSort === 1 ? "person" : "people"}
        </Button>
      ) : null}
      <Button variant={toSort > 0 ? "ghost" : "primary"} disabled={pending} onClick={() => start(() => finishOnboardingAction("/today"))}>
        {toSort > 0 ? "Sort them later" : "Go to Today"}
      </Button>
    </div>
  );
}
