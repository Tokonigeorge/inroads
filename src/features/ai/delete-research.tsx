"use client";

import { useTransition } from "react";
import { deleteResearchAction } from "./actions";

export function DeleteResearchButton({ dossierId }: { dossierId: string }) {
  const [pending, start] = useTransition();
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => start(() => deleteResearchAction(dossierId))} className="text-small text-muted underline underline-offset-2 hover:text-text">
        Delete this research
      </button>
    </div>
  );
}
