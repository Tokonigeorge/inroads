"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useId, type Dispatch, type SetStateAction } from "react";
import type { Stage } from "@/contracts/spaces";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";

export type StageDraft = { uid: string; key?: string; label: string; closed: boolean };

let seq = 0;
const uid = () => `s${++seq}`;
export const toDrafts = (stages: Stage[]): StageDraft[] => stages.map((s) => ({ uid: uid(), key: s.key, label: s.label, closed: Boolean(s.closed) }));
export const fromDrafts = (stages: StageDraft[]) => stages.map(({ key, label, closed }) => ({ key, label, closed }));

/** Ordered list of pipeline stages: rename, reorder, mark as an end state, add, remove. */
export function StagesEditor({
  stages,
  setStages,
  error,
  hint,
  legend = "Pipeline stages",
}: {
  stages: StageDraft[];
  setStages: Dispatch<SetStateAction<StageDraft[]>>;
  error?: string;
  hint: string;
  legend?: string;
}) {
  const hintId = useId();
  const update = (i: number, patch: Partial<StageDraft>) => setStages((st) => st.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) =>
    setStages((st) => {
      const next = [...st];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  return (
    <fieldset className="grid gap-2" aria-describedby={hintId}>
      <legend className="pb-1 text-small font-[550]">{legend}</legend>
      <p id={hintId} className="text-small text-muted">
        {hint}
      </p>
      <ol className="grid gap-2">
        {stages.map((s, i) => (
          <li key={s.uid} className="flex items-center gap-2">
            <span className="w-5 text-right text-small text-muted tabular" aria-hidden>
              {i + 1}
            </span>
            <Input value={s.label} onChange={(e) => update(i, { label: e.target.value })} aria-label={`Stage ${i + 1} name`} maxLength={40} className="flex-1" />
            <label className="flex shrink-0 items-center gap-1.5 text-small text-muted">
              <input type="checkbox" checked={s.closed} onChange={(e) => update(i, { closed: e.target.checked })} className="accent-[var(--accent)]" />
              End
            </label>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${s.label || "stage"} up`} className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-sunken disabled:opacity-30">
              <ArrowUp size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === stages.length - 1}
              aria-label={`Move ${s.label || "stage"} down`}
              className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-sunken disabled:opacity-30"
            >
              <ArrowDown size={16} aria-hidden />
            </button>
            <button type="button" onClick={() => setStages((st) => st.filter((_, j) => j !== i))} aria-label={`Remove ${s.label || "stage"}`} className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-sunken">
              <X size={16} aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      <div>
        <Button size="sm" variant="ghost" onClick={() => setStages((st) => [...st, { uid: uid(), label: "", closed: false }])} disabled={stages.length >= 12}>
          Add a stage
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
