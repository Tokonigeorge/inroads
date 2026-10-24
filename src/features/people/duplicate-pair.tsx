"use client";

import { useState, useTransition } from "react";
import { formatPhone } from "@/domain/normalise";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/toast";
import { keepBothAction, mergeAction, undoMergeAction } from "./duplicate-actions";

export type DupPerson = {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  company: string | null;
  position: string | null;
  city: string | null;
  birthday: string | null;
  spaces: string[];
  touches: number;
  added: string;
};

const fields = [
  ["name", "Name"],
  ["company", "Company"],
  ["position", "Role"],
  ["city", "City"],
  ["birthday", "Birthday"],
] as const;

/** Side by side: choose who to keep and, for each differing detail, which value. Emails and phones are combined. */
export function DuplicatePair({ suggestionId, why, a, b }: { suggestionId: string; why: string; a: DupPerson; b: DupPerson }) {
  const [keepA, setKeepA] = useState(a.touches >= b.touches);
  const keep = keepA ? a : b;
  const other = keepA ? b : a;
  const [choices, setChoices] = useState<Record<string, "keep" | "other">>({});
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const toast = useToast();
  const differing = fields.filter(([f]) => keep[f] && other[f] && keep[f] !== other[f]);
  if (done) return null;

  const merge = () =>
    start(async () => {
      const r = await mergeAction({ suggestionId, keepId: keep.id, otherId: other.id, choices });
      if (!r.ok) return toast.show(r.message ?? "Couldn't merge them.");
      setDone(true);
      toast.show(`Merged into ${choices.name === "other" ? other.name : keep.name}.`, {
        label: "Undo",
        onClick: () => start(async () => void (await undoMergeAction(suggestionId))),
      });
    });

  const column = (p: DupPerson, isKeep: boolean) => (
    <div className={`grid content-start gap-1.5 rounded-md border p-3 ${isKeep ? "border-accent" : "border-border"}`}>
      <label className="flex items-center gap-2 font-semibold">
        <input type="radio" name={`keep-${suggestionId}`} checked={isKeep} onChange={() => setKeepA(p.id === a.id)} className="accent-[var(--accent)]" />
        {p.name}
      </label>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-small">
        {p.company || p.position ? (
          <>
            <dt className="text-muted">Work</dt>
            <dd>{[p.position, p.company].filter(Boolean).join(" at ")}</dd>
          </>
        ) : null}
        {p.emails.length ? (
          <>
            <dt className="text-muted">Email</dt>
            <dd className="break-all">{p.emails.join(", ")}</dd>
          </>
        ) : null}
        {p.phones.length ? (
          <>
            <dt className="text-muted">Phone</dt>
            <dd>{p.phones.map(formatPhone).join(", ")}</dd>
          </>
        ) : null}
        <dt className="text-muted">Spaces</dt>
        <dd>{p.spaces.join(", ") || "None"}</dd>
        <dt className="text-muted">Touches</dt>
        <dd>{p.touches}</dd>
        <dt className="text-muted">Added</dt>
        <dd>{p.added}</dd>
      </dl>
    </div>
  );

  return (
    <article aria-label={`Possible duplicate: ${a.name}`} className="grid gap-4 rounded-md border border-border bg-surface p-4">
      <p className="text-small text-muted">{why}</p>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Who to keep</legend>
        {column(a, keepA)}
        {column(b, !keepA)}
      </fieldset>
      {differing.length ? (
        <fieldset className="grid gap-2">
          <legend className="pb-1 text-small font-[550]">Where they differ, keep</legend>
          {differing.map(([f, label]) => (
            <div key={f} role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2 text-small">
              <span className="w-20 text-muted">{label}</span>
              {(["keep", "other"] as const).map((side) => (
                <label key={side} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                  <input type="radio" name={`${suggestionId}-${f}`} checked={(choices[f] ?? "keep") === side} onChange={() => setChoices((c) => ({ ...c, [f]: side }))} className="sr-only" />
                  {(side === "keep" ? keep : other)[f]}
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      ) : null}
      <p className="text-small text-muted">Emails, phones and profiles are combined. Touches, promises, goals and rooms move to the person you keep. You can undo this for 30 days.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={pending} onClick={merge}>
          Merge into {keep.name}
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await keepBothAction(suggestionId);
              setDone(true);
              toast.show("Kept both.");
            })
          }
        >
          Keep both
        </Button>
      </div>
    </article>
  );
}

export function UndoMergeButton({ suggestionId }: { suggestionId: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await undoMergeAction(suggestionId);
          toast.show(r.ok ? "Merge undone." : (r.message ?? "Couldn't undo."));
        })
      }
    >
      Undo
    </Button>
  );
}
