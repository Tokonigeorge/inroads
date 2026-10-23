"use client";

import { useTransition } from "react";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/toast";
import { loadExamplesAction, removeExamplesAction } from "./actions";

export function ExampleDataForm({ loaded }: { loaded: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const run = (fn: () => Promise<void>, done: string) =>
    start(async () => {
      try {
        await fn();
        toast.show(done);
      } catch {
        toast.show("Couldn't do that. Check your connection and try again.");
      }
    });
  return loaded ? (
    <Button disabled={pending} onClick={() => run(removeExamplesAction, "Example data removed.")}>
      {pending ? "Removing…" : "Remove example data"}
    </Button>
  ) : (
    <Button variant="primary" disabled={pending} onClick={() => run(loadExamplesAction, "Example network loaded.")}>
      {pending ? "Loading…" : "Load example data"}
    </Button>
  );
}
