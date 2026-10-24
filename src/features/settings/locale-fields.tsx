"use client";

import { useRef, useSyncExternalStore } from "react";
import { Button } from "@/ui/button";
import { Field, Select } from "@/ui/field";

const noop = () => () => {};
const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Time zone picker with a one-tap "use this device's zone". */
export function TimezoneField({ value, timezones, error }: { value: string; timezones: string[]; error?: string }) {
  const device = useSyncExternalStore(noop, deviceZone, () => "");
  const ref = useRef<HTMLSelectElement>(null);
  return (
    <Field label="Time zone" hint="Reminders, birthdays and your agenda follow this." error={error}>
      {({ id, describedBy, invalid }) => (
        <div className="grid gap-2">
          <Select ref={ref} id={id} name="timezone" defaultValue={value} aria-describedby={describedBy} aria-invalid={invalid}>
            {timezones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
          {device && device !== value && timezones.includes(device) ? (
            <div>
              <Button size="sm" variant="ghost" onClick={() => ref.current && (ref.current.value = device)}>
                Use this device&apos;s zone ({device.replace(/_/g, " ")})
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Field>
  );
}

export function RegionField({ value, countries, error }: { value: string; countries: { code: string; name: string }[]; error?: string }) {
  return (
    <Field label="Country for phone numbers" hint="Numbers without a country code are read as local to this country." error={error}>
      {({ id, describedBy, invalid }) => (
        <Select id={id} name="region" defaultValue={value} aria-describedby={describedBy} aria-invalid={invalid}>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
