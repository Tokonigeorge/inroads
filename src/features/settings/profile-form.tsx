"use client";

import { useActionState } from "react";
import { initialFormState } from "@/features/forms";
import { Button } from "@/ui/button";
import { Field, Input, Textarea } from "@/ui/field";
import { saveProfileAction } from "./actions";
import { RegionField, TimezoneField } from "./locale-fields";

export type ProfileValues = {
  name: string;
  headline: string | null;
  location: string | null;
  background: string | null;
  offerings: string | null;
  industries: string[];
  timezone: string;
  region: string;
  briefTime: string;
};

type Props = { profile: ProfileValues; timezones: string[]; countries: { code: string; name: string }[] };

export function ProfileForm({ profile, timezones, countries }: Props) {
  const [state, action, pending] = useActionState(saveProfileAction, initialFormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid max-w-[560px] gap-6" noValidate>
      <Field label="Name" error={errors.name}>
        {({ id, describedBy, invalid }) => (
          <Input id={id} name="name" defaultValue={profile.name} autoComplete="name" maxLength={80} required aria-describedby={describedBy} aria-invalid={invalid} />
        )}
      </Field>
      <Field label="What you do" hint="One line, e.g. Founder at Paystack-for-schools." error={errors.headline}>
        {({ id, describedBy, invalid }) => (
          <Input id={id} name="headline" defaultValue={profile.headline ?? ""} maxLength={120} aria-describedby={describedBy} aria-invalid={invalid} />
        )}
      </Field>
      <Field label="Where you're based" error={errors.location}>
        {({ id, describedBy, invalid }) => (
          <Input id={id} name="location" defaultValue={profile.location ?? ""} maxLength={80} autoComplete="address-level2" aria-describedby={describedBy} aria-invalid={invalid} />
        )}
      </Field>
      <Field label="Background" hint="Your story in a few lines. Research and drafts use it to find common ground." error={errors.background}>
        {({ id, describedBy, invalid }) => (
          <Textarea id={id} name="background" rows={4} defaultValue={profile.background ?? ""} maxLength={2000} aria-describedby={describedBy} aria-invalid={invalid} />
        )}
      </Field>
      <Field label="What you can offer" hint="Intros, advice, hiring, capital: what you're glad to help others with." error={errors.offerings}>
        {({ id, describedBy, invalid }) => (
          <Textarea id={id} name="offerings" rows={3} defaultValue={profile.offerings ?? ""} maxLength={1000} aria-describedby={describedBy} aria-invalid={invalid} />
        )}
      </Field>
      <Field label="Industries" hint="Separate with commas." error={errors.industries}>
        {({ id, describedBy, invalid }) => (
          <Input id={id} name="industries" defaultValue={profile.industries.join(", ")} maxLength={400} aria-describedby={describedBy} aria-invalid={invalid} />
        )}
      </Field>
      <TimezoneField value={profile.timezone} timezones={timezones} error={errors.timezone} />
      <RegionField value={profile.region} countries={countries} error={errors.region} />
      <Field label="Brief time" hint="When your daily brief is ready on Today." error={errors.briefTime}>
        {({ id, describedBy, invalid }) => (
          <Input id={id} name="briefTime" type="time" step={900} defaultValue={profile.briefTime} className="max-w-40" aria-describedby={describedBy} aria-invalid={invalid} />
        )}
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
        {state.message ? (
          <p role="alert" className="text-small text-danger">
            {state.message}
          </p>
        ) : state.ok ? (
          <p role="status" className="text-small text-accent">
            Saved.
          </p>
        ) : null}
      </div>
    </form>
  );
}
