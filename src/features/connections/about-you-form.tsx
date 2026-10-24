"use client";

import { useActionState } from "react";
import { initialFormState } from "@/features/forms";
import { RegionField, TimezoneField } from "@/features/settings/locale-fields";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { saveAboutYouAction } from "./actions";

type Props = {
  name: string;
  timezone: string;
  region: string;
  timezones: string[];
  countries: { code: string; name: string }[];
};

export function AboutYouForm({ name, timezone, region, timezones, countries }: Props) {
  const [state, action, pending] = useActionState(saveAboutYouAction, initialFormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid max-w-[480px] gap-6" noValidate>
      <Field label="Your name" error={errors.name}>
        {({ id, describedBy, invalid }) => (
          <Input id={id} name="name" defaultValue={name} autoComplete="name" maxLength={80} required aria-describedby={describedBy} aria-invalid={invalid} />
        )}
      </Field>
      <TimezoneField value={timezone} timezones={timezones} error={errors.timezone} />
      <RegionField value={region} countries={countries} error={errors.region} />
      {state.message ? (
        <p role="alert" className="text-small text-danger">
          {state.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
