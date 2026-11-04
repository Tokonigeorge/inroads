"use client";

import { useState, useTransition } from "react";
import { sendCapture, type SendResult } from "@/features/offline/outbox";
import { useAfterCapture } from "@/features/people/capture-forms";
import { Button } from "@/ui/button";
import { Field, Segmented, Textarea } from "@/ui/field";

export type RemindIn = "0" | "1" | "3" | "7";

/**
 * A progress note on a promise that isn't done yet ("Spoke to Favour, waiting on HR"). Works
 * offline. On Today it also asks when to show the card again, since progress usually means
 * "not today"; on a person's page it just adds the note.
 */
export function PromiseUpdateForm({
  commitmentId,
  label,
  remind = false,
  onSaved,
  onCancel,
}: {
  commitmentId: string;
  /** The promise, for the accessible name. */
  label: string;
  /** Ask when to bring the card back (Today only). */
  remind?: boolean;
  onSaved: (r: SendResult & { ok: true }, remindIn: number) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [when, setWhen] = useState<RemindIn>("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      if (!text.trim()) return setError("Write what's happened so far.");
      const r = await sendCapture({ kind: "promise_update", data: { id: commitmentId, updateId: crypto.randomUUID(), text: text.trim() } });
      if (!r.ok) return setError(r.message);
      onSaved(r, remind ? Number(when) : 0);
    });
  return (
    <form
      aria-label={`Update on: ${label}`}
      className="grid gap-2.5 rounded-md bg-sunk p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="What's happened so far?" error={error ?? undefined}>
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            autoFocus
            value={text}
            maxLength={500}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            placeholder="Spoke to Favour; waiting on HR to confirm."
            className="min-h-[64px]"
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
          />
        )}
      </Field>
      {remind ? (
        <Segmented
          name={`remind-${commitmentId}`}
          legend="Show this again"
          value={when}
          onChange={setWhen}
          options={[
            { value: "1", label: "Tomorrow" },
            { value: "3", label: "In 3 days" },
            { value: "7", label: "Next week" },
            { value: "0", label: "Keep it here" },
          ]}
        />
      ) : null}
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save update"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const shortDate = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** The progress notes under a promise on a person's page, newest first. */
export function PromiseUpdates({ updates }: { updates: { id: string; on: string; text: string }[] }) {
  if (!updates.length) return null;
  const newest = [...updates].reverse();
  const shown = newest.slice(0, 3);
  const rest = newest.slice(3);
  const row = (u: (typeof updates)[number]) => (
    <li key={u.id} className="text-[13.5px]">
      <span className="font-mono text-[11.5px] text-muted">{shortDate(u.on)}</span> {u.text}
    </li>
  );
  return (
    <div className="mt-1 border-l-2 border-line pl-2.5">
      <ul className="grid gap-0.5" aria-label="Updates">
        {shown.map(row)}
      </ul>
      {rest.length ? (
        <details>
          <summary className="cursor-pointer text-[13px] text-muted">{rest.length === 1 ? "1 earlier update" : `${rest.length} earlier updates`}</summary>
          <ul className="mt-0.5 grid gap-0.5">{rest.map(row)}</ul>
        </details>
      ) : null}
    </div>
  );
}

/** "Add update" under an open promise on a person's page. */
export function PromiseUpdateButton({ commitmentId, label }: { commitmentId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const after = useAfterCapture();
  if (!open)
    return (
      <button type="button" className="mt-0.5 text-[13px] font-semibold text-accent hover:underline" onClick={() => setOpen(true)} aria-label={`Add an update on: ${label}`}>
        Add update
      </button>
    );
  return (
    <div className="mt-1.5">
      <PromiseUpdateForm
        commitmentId={commitmentId}
        label={label}
        onCancel={() => setOpen(false)}
        onSaved={(r) => {
          setOpen(false);
          after(r, "Update saved.");
        }}
      />
    </div>
  );
}
