"use client";

import { useActionState, useRef, useSyncExternalStore } from "react";
import { initialFormState } from "@/features/forms";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/field";
import { saveAboutYouAction } from "./actions";

type Props = {
  name: string;
  timezone: string;
  region: string;
  timezones: string[];
  countries: { code: string; name: string }[];
};

const noop = () => () => {};
const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function AboutYouForm({ name, timezone, region, timezones, countries }: Props) {
  const [state, action, pending] = useActionState(saveAboutYouAction, initialFormState);
  const errors = state.fieldErrors ?? {};
  const device = useSyncExternalStore(noop, deviceZone, () => "");
  const tzRef = useRef<HTMLSelectElement>(null);
  return (
    <form action={action} className="grid max-w-[480px] gap-6" noValidate>
      <Field label="Your name" error={errors.name}>
        {({ id, describedBy, invalid }) => (
          <Input id={id} name="name" defaultValue={name} autoComplete="name" maxLength={80} required aria-describedby={describedBy} aria-invalid={invalid} />
        )}
      </Field>
      <Field label="Time zone" hint="Reminders, birthdays and your agenda follow this." error={errors.timezone}>
        {({ id, describedBy, invalid }) => (
          <div className="grid gap-2">
            <Select ref={tzRef} id={id} name="timezone" defaultValue={timezone} aria-describedby={describedBy} aria-invalid={invalid}>
              {timezones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
            {device && device !== timezone && timezones.includes(device) ? (
              <div>
                <Button size="sm" variant="ghost" onClick={() => tzRef.current && (tzRef.current.value = device)}>
                  Use this device&apos;s zone ({device.replace(/_/g, " ")})
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Field>
      <Field label="Country for phone numbers" hint="Numbers without a country code are read as local to this country." error={errors.region}>
        {({ id, describedBy, invalid }) => (
          <Select id={id} name="region" defaultValue={region} aria-describedby={describedBy} aria-invalid={invalid}>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
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
