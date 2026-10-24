"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { touchTypeLabels, touchTypes, type TouchType } from "@/contracts/people";
import { addDays, todayIn } from "@/domain/dates";
import { sendCapture, type SendResult } from "@/features/offline/outbox";
import { Button } from "@/ui/button";
import { Field, Input, Segmented, Select, Textarea } from "@/ui/field";
import { useToast } from "@/ui/toast";

export type PickedPerson = { id: string; name: string; spaces: { id: string; name: string }[] };

const LAST_TYPE_KEY = "inroads.lastTouchType";
const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;
const localToday = () => todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);

/** After any capture: tell the user where it went and refresh what's on screen. */
export function useAfterCapture() {
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  return (r: SendResult, done: string) => {
    if (!r.ok) return false;
    toast.show(r.queued ? "Saved on this device. It will sync when you're back online." : done);
    // Offline, a refresh would fail and drop the user on the offline page. The outbox
    // refreshes the screen once queued changes reach the server.
    if (!r.queued) {
      void queryClient.invalidateQueries({ queryKey: ["people"] });
      router.refresh();
    }
    return true;
  };
}

function SpaceSelect({ person, value, onChange }: { person: PickedPerson; value: string; onChange: (v: string) => void }) {
  if (person.spaces.length < 2) return null;
  return (
    <Field label="Space">
      {({ id }) => (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {person.spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

/** Log a touch in a few seconds: date and type are pre-filled, everything else is optional. */
export function LogTouchForm({ person, defaultSpaceId, onDone }: { person: PickedPerson; defaultSpaceId?: string; onDone: () => void }) {
  const today = localToday();
  const after = useAfterCapture();
  const [spaceId, setSpaceId] = useState(defaultSpaceId && person.spaces.some((s) => s.id === defaultSpaceId) ? defaultSpaceId : person.spaces[0]?.id ?? "");
  const [type, setType] = useState<TouchType>(() => {
    try {
      const v = localStorage.getItem(LAST_TYPE_KEY) as TouchType | null;
      return v && touchTypes.includes(v) ? v : "coffee";
    } catch {
      return "coffee";
    }
  });
  const [date, setDate] = useState(today);
  const [withPromise, setWithPromise] = useState(false);
  const [owner, setOwner] = useState<"me" | "them">("me");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const promiseText = String(f.get("promise") ?? "").trim();
    if (withPromise && !promiseText) return setError("Say what was promised, or untick the promise.");
    setBusy(true);
    try {
      localStorage.setItem(LAST_TYPE_KEY, type);
    } catch {}
    const r = await sendCapture({
      kind: "touch",
      data: {
        id: crypto.randomUUID(),
        personId: person.id,
        spaceId,
        occurredOn: date,
        type,
        summary: String(f.get("summary") ?? ""),
        promise: withPromise ? { id: crypto.randomUUID(), text: promiseText, owner, dueOn: String(f.get("due") ?? "") || null } : null,
      },
    });
    setBusy(false);
    if (!after(r, `Logged with ${firstName(person.name)}.`)) return setError(r.ok ? null : r.message);
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <Segmented legend="How" name="type" value={type} onChange={setType} options={touchTypes.map((t) => ({ value: t, label: touchTypeLabels[t] }))} />
      <div className="grid gap-1.5">
        <span className="text-small font-[550]" id="touch-when">
          When
        </span>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="touch-when">
          <Button size="sm" variant={date === today ? "primary" : "secondary"} onClick={() => setDate(today)}>
            Today
          </Button>
          <Button size="sm" variant={date === addDays(today, -1) ? "primary" : "secondary"} onClick={() => setDate(addDays(today, -1))}>
            Yesterday
          </Button>
          <Input type="date" aria-label="Date" value={date} max={addDays(today, 1)} onChange={(e) => setDate(e.target.value || today)} className="h-8 w-auto" />
        </div>
      </div>
      <Field label="What happened" hint="Optional. What you talked about, what they need, anything worth remembering.">
        {({ id, describedBy }) => <Textarea id={id} name="summary" rows={3} maxLength={2000} aria-describedby={describedBy} />}
      </Field>
      <SpaceSelect person={person} value={spaceId} onChange={setSpaceId} />
      <label className="flex items-center gap-2 text-small font-[550]">
        <input type="checkbox" checked={withPromise} onChange={(e) => setWithPromise(e.target.checked)} className="accent-[var(--accent)]" />
        Someone promised something
      </label>
      {withPromise ? <PromiseFields person={person} owner={owner} setOwner={setOwner} /> : null}
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" disabled={busy || !spaceId}>
        {busy ? "Saving…" : "Log it"}
      </Button>
    </form>
  );
}

function PromiseFields({ person, owner, setOwner }: { person: PickedPerson; owner: "me" | "them"; setOwner: (o: "me" | "them") => void }) {
  return (
    <div className="grid gap-4 border-l-2 border-border pl-3">
      <Field label="What was promised">{({ id }) => <Input id={id} name="promise" maxLength={300} placeholder="Send the deck, intro to Bola…" />}</Field>
      <Segmented
        legend="Who owes it"
        name="owner"
        value={owner}
        onChange={setOwner}
        options={[
          { value: "me", label: "I do" },
          { value: "them", label: `${firstName(person.name)} does` },
        ]}
      />
      <Field label="Due" hint="Optional.">
        {({ id, describedBy }) => <Input id={id} name="due" type="date" aria-describedby={describedBy} className="w-auto" />}
      </Field>
    </div>
  );
}

export function AddPromiseForm({ person, defaultSpaceId, onDone }: { person: PickedPerson; defaultSpaceId?: string; onDone: () => void }) {
  const after = useAfterCapture();
  const [spaceId, setSpaceId] = useState(defaultSpaceId && person.spaces.some((s) => s.id === defaultSpaceId) ? defaultSpaceId : person.spaces[0]?.id ?? "");
  const [owner, setOwner] = useState<"me" | "them">("me");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = String(f.get("promise") ?? "").trim();
    if (!text) return setError("Say what was promised.");
    setBusy(true);
    const r = await sendCapture({
      kind: "promise",
      data: { id: crypto.randomUUID(), personId: person.id, spaceId, text, owner, dueOn: String(f.get("due") ?? "") || null },
    });
    setBusy(false);
    if (!after(r, "Promise added.")) return setError(r.ok ? null : r.message);
    onDone();
  }
  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <PromiseFields person={person} owner={owner} setOwner={setOwner} />
      <SpaceSelect person={person} value={spaceId} onChange={setSpaceId} />
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" disabled={busy || !spaceId}>
        {busy ? "Saving…" : "Add promise"}
      </Button>
    </form>
  );
}
