"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useActionState, useId, useState, useTransition } from "react";
import {
  cadenceChoices,
  researchModeLabels,
  researchModesFor,
  spaceKindLabels,
  type SpaceDefaults,
  type SpaceKind,
  type Stage,
} from "@/contracts/spaces";
import { initialFormState, type FormState } from "@/features/forms";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { deleteSpaceAction, setSpaceArchivedAction, updateSpaceAction } from "./actions";

type SpaceProps = {
  id: string;
  name: string;
  kind: SpaceKind;
  archived: boolean;
  people: number;
  defaults: SpaceDefaults;
};

type StageDraft = { uid: string; key?: string; label: string; closed: boolean };

let seq = 0;
const uid = () => `s${++seq}`;

export function EditSpaceForm({ space }: { space: SpaceProps }) {
  const [state, action, pending] = useActionState(updateSpaceAction.bind(null, space.id), initialFormState as FormState & { stages?: Stage[] });
  const errors = state.fieldErrors ?? {};
  const [stages, setStages] = useState<StageDraft[]>(() =>
    space.defaults.stages.map((s) => ({ uid: uid(), key: s.key, label: s.label, closed: Boolean(s.closed) })),
  );
  const cadence = space.defaults.cadenceDays;
  const cadenceOptions = cadenceChoices.some((c) => c.days === cadence)
    ? cadenceChoices
    : [...cadenceChoices, { days: cadence, label: `Every ${cadence} days` }];
  const stagesHint = useId();

  // After a save, adopt the stored stage keys so a later rename keeps pipeline links intact.
  // (Adjusting state during render when the save result changes, as React recommends.)
  const [appliedSave, setAppliedSave] = useState<number | undefined>(undefined);
  if (state.savedAt !== appliedSave) {
    setAppliedSave(state.savedAt);
    if (state.stages) setStages(state.stages.map((s) => ({ uid: uid(), key: s.key, label: s.label, closed: Boolean(s.closed) })));
  }

  const update = (i: number, patch: Partial<StageDraft>) => setStages((st) => st.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) =>
    setStages((st) => {
      const next = [...st];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  return (
    <div className="grid gap-10">
      <form action={action} className="grid max-w-[560px] gap-6" noValidate>
        <p className="text-small text-muted">
          {spaceKindLabels[space.kind].label} Space · {space.people === 1 ? "1 person" : `${space.people} people`}
        </p>

        <Field label="Name" error={errors.name}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} name="name" defaultValue={space.name} maxLength={40} required aria-describedby={describedBy} aria-invalid={invalid} />
          )}
        </Field>

        <Field label="Default reminder" hint="How often to nudge you about people in this Space. You can change it per person or circle." error={errors.cadenceDays}>
          {({ id, describedBy }) => (
            <select
              id={id}
              name="cadenceDays"
              defaultValue={cadence ?? "none"}
              aria-describedby={describedBy}
              className="h-10 w-full rounded-sm border border-border-strong bg-surface px-2 text-[16px] md:text-body"
            >
              {cadenceOptions.map((c) => (
                <option key={c.days ?? "none"} value={c.days ?? "none"}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        <fieldset className="grid gap-2">
          <legend className="pb-1 text-small font-[550]">Research</legend>
          {researchModesFor(space.kind).map((mode) => (
            <label key={mode} className="flex cursor-pointer gap-3 rounded-md border border-border px-3 py-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input type="radio" name="researchMode" value={mode} defaultChecked={space.defaults.researchMode === mode} className="mt-1 accent-[var(--accent)]" />
              <span className="grid">
                <span className="font-[550]">{researchModeLabels[mode].label}</span>
                <span className="text-small text-muted">{researchModeLabels[mode].hint}</span>
              </span>
            </label>
          ))}
          {space.kind !== "work" ? <p className="text-small text-muted">Full research is only available in Work Spaces.</p> : null}
          {errors.researchMode ? <p className="text-small text-danger">{errors.researchMode}</p> : null}
        </fieldset>

        <fieldset className="grid gap-2" aria-describedby={stagesHint}>
          <legend className="pb-1 text-small font-[550]">Pipeline stages</legend>
          <p id={stagesHint} className="text-small text-muted">
            The steps people move through for a goal in this Space, in order. Mark the ones that end the journey.
          </p>
          <ol className="grid gap-2">
            {stages.map((s, i) => (
              <li key={s.uid} className="flex items-center gap-2">
                <span className="w-5 text-right text-small text-muted tabular" aria-hidden>
                  {i + 1}
                </span>
                <Input
                  value={s.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  aria-label={`Stage ${i + 1} name`}
                  maxLength={40}
                  className="flex-1"
                />
                <label className="flex shrink-0 items-center gap-1.5 text-small text-muted">
                  <input type="checkbox" checked={s.closed} onChange={(e) => update(i, { closed: e.target.checked })} className="accent-[var(--accent)]" />
                  End
                </label>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${s.label || "stage"} up`} className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-sunken disabled:opacity-30">
                  <ArrowUp size={16} aria-hidden />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === stages.length - 1} aria-label={`Move ${s.label || "stage"} down`} className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-sunken disabled:opacity-30">
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
          <input type="hidden" name="stages" value={JSON.stringify(stages.map(({ key, label, closed }) => ({ key, label, closed })))} />
          {errors.stages ? (
            <p role="alert" className="text-small text-danger">
              {errors.stages}
            </p>
          ) : null}
        </fieldset>

        <FormStatus state={state} />
        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>

      <DangerZone space={space} />
    </div>
  );
}

function FormStatus({ state }: { state: FormState }) {
  if (state.message) {
    return (
      <p role="alert" className="text-small text-danger">
        {state.message}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="text-small text-accent">
        Saved.
      </p>
    );
  }
  return null;
}

function DangerZone({ space }: { space: SpaceProps }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const toast = useToast();
  const run = (fn: () => Promise<FormState>, done?: string) =>
    start(async () => {
      const r = await fn();
      if (r.message) setMessage(r.message);
      else if (done) toast.show(done);
    });

  return (
    <section className="grid max-w-[560px] gap-3 border-t border-border pt-6">
      <h2 className="text-title font-semibold">Archive or delete</h2>
      <p className="text-small text-muted">
        Archiving hides the Space and its people from lists and reminders, and keeps everything. Deleting is only possible when the Space is empty.
      </p>
      <div className="flex flex-wrap gap-2">
        {space.archived ? (
          <Button disabled={pending} onClick={() => run(() => setSpaceArchivedAction(space.id, false), `${space.name} is back.`)}>
            Unarchive
          </Button>
        ) : (
          <Button disabled={pending} onClick={() => run(() => setSpaceArchivedAction(space.id, true), `${space.name} archived.`)}>
            Archive
          </Button>
        )}
        {confirming ? (
          <>
            <Button variant="danger" disabled={pending} onClick={() => run(() => deleteSpaceAction(space.id))}>
              Delete {space.name}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
      </div>
      {confirming ? <p className="text-small text-muted">Delete this Space? This can&apos;t be undone.</p> : null}
      {message ? (
        <p role="alert" className="text-small text-danger">
          {message}
        </p>
      ) : null}
    </section>
  );
}
