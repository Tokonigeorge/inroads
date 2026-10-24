"use client";

import { useActionState, useState, useTransition } from "react";
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
import { fromDrafts, StagesEditor, toDrafts, type StageDraft } from "./stages-editor";

type SpaceProps = {
  id: string;
  name: string;
  kind: SpaceKind;
  archived: boolean;
  people: number;
  defaults: SpaceDefaults;
};


export function EditSpaceForm({ space }: { space: SpaceProps }) {
  const [state, action, pending] = useActionState(updateSpaceAction.bind(null, space.id), initialFormState as FormState & { stages?: Stage[] });
  const errors = state.fieldErrors ?? {};
  const [stages, setStages] = useState<StageDraft[]>(() => toDrafts(space.defaults.stages));
  const cadence = space.defaults.cadenceDays;
  const cadenceOptions = cadenceChoices.some((c) => c.days === cadence)
    ? cadenceChoices
    : [...cadenceChoices, { days: cadence, label: `Every ${cadence} days` }];

  // After a save, adopt the stored stage keys so a later rename keeps pipeline links intact.
  // (Adjusting state during render when the save result changes, as React recommends.)
  const [appliedSave, setAppliedSave] = useState<number | undefined>(undefined);
  if (state.savedAt !== appliedSave) {
    setAppliedSave(state.savedAt);
    if (state.stages) setStages(toDrafts(state.stages));
  }


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

        <StagesEditor
          stages={stages}
          setStages={setStages}
          error={errors.stages}
          hint="The steps people move through for a goal in this Space, in order. Mark the ones that end the journey."
        />
        <input type="hidden" name="stages" value={JSON.stringify(fromDrafts(stages))} />

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
