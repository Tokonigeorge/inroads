"use client";

import { useActionState } from "react";
import { spaceKindLabels, spaceKinds } from "@/contracts/spaces";
import { initialFormState } from "@/features/forms";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { createSpaceAction } from "./actions";

export function NewSpaceForm() {
  const [state, action, pending] = useActionState(createSpaceAction, initialFormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid max-w-[520px] gap-6" noValidate>
      <Field label="Name" hint="For example: Alumni, Church, Agency clients." error={errors.name}>
        {({ id, describedBy, invalid }) => (
          <Input id={id} name="name" required maxLength={40} autoComplete="off" aria-describedby={describedBy} aria-invalid={invalid} autoFocus />
        )}
      </Field>
      <fieldset className="grid gap-2" aria-describedby={errors.kind ? "kind-error" : undefined}>
        <legend className="pb-1 text-small font-[550]">What is it for?</legend>
        {spaceKinds.map((kind) => (
          <label key={kind} className="flex cursor-pointer gap-3 rounded-md border border-border px-3 py-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
            <input type="radio" name="kind" value={kind} defaultChecked={kind === "custom"} className="mt-1 accent-[var(--accent)]" />
            <span className="grid">
              <span className="font-[550]">{spaceKindLabels[kind].label}</span>
              <span className="text-small text-muted">{spaceKindLabels[kind].hint}</span>
            </span>
          </label>
        ))}
        {errors.kind ? (
          <p id="kind-error" className="text-small text-danger">
            {errors.kind}
          </p>
        ) : null}
        <p className="text-small text-muted">This sets the starting reminder, pipeline and research options. You can change those later, but not the type.</p>
      </fieldset>
      {state.message ? (
        <p role="alert" className="text-small text-danger">
          {state.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : "Create Space"}
        </Button>
      </div>
    </form>
  );
}
