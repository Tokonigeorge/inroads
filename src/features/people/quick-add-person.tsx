"use client";

import { todayIn } from "@/domain/dates";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { sendCapture } from "@/features/offline/outbox";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/field";
import { useAfterCapture } from "./capture-forms";

type SpacesResponse = { spaces: { id: string; name: string }[]; selectedId: string | null; aiEnabled?: boolean; timezone?: string };
const CACHE_KEY = "inroads.spaces";

/** Active Spaces, cached on the device so capture still works offline. */
export function useSpaces() {
  return useQuery({
    queryKey: ["spaces"],
    queryFn: async (): Promise<SpacesResponse> => {
      try {
        const res = await fetch("/api/v1/spaces");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as SpacesResponse;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {}
        return data;
      } catch {
        const cached = typeof localStorage !== "undefined" ? localStorage.getItem(CACHE_KEY) : null;
        if (cached) return JSON.parse(cached) as SpacesResponse;
        throw new Error("Couldn't load your Spaces");
      }
    },
  });
}

/**
 * Today in your profile's time zone (the server's "today"), falling back to this browser's.
 * Around midnight the two can differ by a day, and touches should land on your day.
 */
export function useUserToday() {
  const { data } = useSpaces();
  const tz = data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    return todayIn(tz);
  } catch {
    return todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }
}

/** Name plus one way to reach them. Everything else can wait. */
export function QuickAddPerson({ onDone }: { onDone: () => void }) {
  const { data } = useSpaces();
  const router = useRouter();
  const after = useAfterCapture();
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const spaces = data?.spaces ?? [];
  const defaultSpace = data?.selectedId ?? spaces[0]?.id;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    if (!name) return setError({ message: "Add a name.", field: "name" });
    const contact = String(f.get("contact") ?? "").trim();
    const isEmail = contact.includes("@");
    const id = crypto.randomUUID();
    setBusy(true);
    const r = await sendCapture({
      kind: "person",
      data: {
        id,
        identity: { name, emails: isEmail && contact ? [contact] : [], phones: !isEmail && contact ? [contact] : [] },
        membership: { spaceId: String(f.get("spaceId") ?? defaultSpace), whereMet: String(f.get("whereMet") ?? "") },
      },
    });
    setBusy(false);
    if (!r.ok) return setError({ message: r.message, field: r.field === "emails" || r.field === "phones" ? "contact" : r.field });
    after(r, `${name} added.`);
    onDone();
    if (!r.queued) router.push(`/people/${id}`);
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <Field label="Name" error={error?.field === "name" ? error.message : undefined}>
        {({ id, describedBy, invalid }) => <Input id={id} name="name" autoFocus autoComplete="off" aria-describedby={describedBy} aria-invalid={invalid} />}
      </Field>
      <Field label="Phone or email" hint="Optional." error={error?.field === "contact" ? error.message : undefined}>
        {({ id, describedBy, invalid }) => <Input id={id} name="contact" autoComplete="off" inputMode="email" aria-describedby={describedBy} aria-invalid={invalid} />}
      </Field>
      <Field label="Where you met" hint="Optional.">
        {({ id, describedBy }) => <Input id={id} name="whereMet" autoComplete="off" placeholder="Event, intro, venue…" aria-describedby={describedBy} />}
      </Field>
      {spaces.length > 1 ? (
        <Field label="Space">
          {({ id }) => (
            <Select id={id} name="spaceId" defaultValue={defaultSpace}>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      {error && !["name", "contact"].includes(error.field ?? "") ? (
        <p role="alert" className="text-small text-danger">
          {error.message}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" disabled={busy || !defaultSpace}>
        {busy ? "Saving…" : "Add person"}
      </Button>
      <Link href="/people/new" onClick={onDone} className="text-center text-small text-muted underline-offset-2 hover:underline">
        Add more details instead
      </Link>
    </form>
  );
}
