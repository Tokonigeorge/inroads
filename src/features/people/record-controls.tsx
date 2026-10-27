"use client";

import { useOptimistic, useTransition } from "react";
import { useToast } from "@/ui/toast";
import { setStarredAction } from "./actions";

/** The prototype's ★ in the sheet header (L1035): priority on or off. */
export function StarToggle({ personId, starred }: { personId: string; starred: boolean }) {
  const [on, setOn] = useOptimistic(starred);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label="Priority"
      title="Priority"
      className={`grid size-[38px] shrink-0 place-items-center rounded-full border border-line bg-surface text-[17px] leading-none ${on ? "text-warm" : "text-faint"}`}
      onClick={() =>
        start(async () => {
          setOn(!on);
          await setStarredAction(personId, !on);
        })
      }
    >
      ★
    </button>
  );
}

/** "Copy" next to an email or phone number (prototype kvc, L1032). */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className="ml-2 text-[13px] font-semibold text-accent hover:underline"
      onClick={() => void navigator.clipboard?.writeText(text).then(() => toast.show("Copied."))}
    >
      Copy
    </button>
  );
}
