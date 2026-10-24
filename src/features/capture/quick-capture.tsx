"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { touchTypeLabels, touchTypes, type TouchType } from "@/contracts/people";
import type { QuickCandidate, QuickReadResult } from "@/contracts/quick-capture";
import { todayIn } from "@/domain/dates";
import { parseQuickCapture } from "@/domain/quick-capture";
import { useAfterCapture } from "@/features/people/capture-forms";
import { useSpaces } from "@/features/people/quick-add-person";
import { sendCapture } from "@/features/offline/outbox";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { quickCapturePlan, type QuickReview } from "./plan";

const localToday = () => todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
const EXAMPLE = "Met Ada, partnerships @ Paystack, wants intro to Tola by Friday";

type Read = QuickReadResult & {
  offline?: boolean;
  spaceId: string;
  line: string;
};

/** One line in, a reviewed person + touch + promises out. Nothing is saved until you press Save. */
export function QuickCapture({ initialLine = "", onDone, hint = EXAMPLE, below }: { initialLine?: string; onDone: () => void; hint?: string; below?: ReactNode }) {
  const { data: spaces } = useSpaces();
  const [read, setRead] = useState<Read | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = spaces?.spaces ?? [];
  const defaultSpace = spaces?.selectedId ?? options[0]?.id ?? "";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const line = String(f.get("line") ?? "").trim();
    const spaceId = String(f.get("spaceId") ?? defaultSpace);
    if (line.length < 2) return setError("Type what happened, e.g. “" + EXAMPLE + "”.");
    if (!spaceId) return setError("Couldn't load your Spaces. Try again.");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/capture/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line, spaceId }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<QuickReadResult> & {
        ok?: boolean;
        message?: string;
      };
      if (res.ok && body.ok && body.draft)
        setRead({
          draft: body.draft,
          source: body.source ?? "rules",
          candidates: body.candidates ?? [],
          spaceId,
          line,
        });
      else if (res.status === 422 || res.status === 401) setError(body.message ?? "That couldn't be read.");
      else throw new Error(String(res.status));
    } catch {
      // Offline or the server is unreachable: read it on this device instead.
      setRead({
        draft: parseQuickCapture(line, localToday()),
        source: "rules",
        candidates: [],
        spaceId,
        line,
        offline: true,
      });
    } finally {
      setBusy(false);
    }
  }

  if (read) return <QuickReviewForm read={read} spaceName={options.find((s) => s.id === read.spaceId)?.name ?? ""} onBack={() => setRead(null)} onDone={onDone} />;

  return (
    <div className="grid gap-6">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="What happened?" hint={`One line, e.g. “${hint}”.`} error={error ?? undefined}>
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              name="line"
              rows={2}
              defaultValue={initialLine}
              maxLength={500}
              autoFocus
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
          )}
        </Field>
        {options.length > 1 ? (
          <Field label="Space">
            {({ id }) => (
              <Select id={id} name="spaceId" defaultValue={defaultSpace}>
                {options.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <div>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Reading…" : "Read it"}
          </Button>
        </div>
      </form>
      {below}
    </div>
  );
}

type PromiseRow = {
  key: string;
  include: boolean;
  text: string;
  owner: "me" | "them";
  dueOn: string;
};

function defaultPick(candidates: QuickCandidate[], name: string | null) {
  const exact = candidates.find((c) => name && c.name.toLowerCase() === name.toLowerCase());
  return exact?.id ?? "new";
}

function QuickReviewForm({ read, spaceName, onBack, onDone }: { read: Read; spaceName: string; onBack: () => void; onDone: () => void }) {
  const d = read.draft;
  const today = localToday();
  const router = useRouter();
  const after = useAfterCapture();
  const uid = useId();
  const [pick, setPick] = useState(() => defaultPick(read.candidates, d.name));
  const [name, setName] = useState(d.name ?? "");
  const [company, setCompany] = useState(d.company ?? "");
  const [position, setPosition] = useState(d.position ?? "");
  const [withTouch, setWithTouch] = useState(Boolean(d.touch));
  const [touchType, setTouchType] = useState<TouchType>(d.touch?.type ?? "meeting");
  const [touchOn, setTouchOn] = useState(d.touch?.occurredOn ?? today);
  const [summary, setSummary] = useState(d.touch?.summary ?? read.line);
  const [promises, setPromises] = useState<PromiseRow[]>(() =>
    d.promises.map((p, i) => ({
      key: String(i),
      include: true,
      text: p.text,
      owner: p.owner,
      dueOn: p.dueOn ?? "",
    })),
  );
  const [followUpOn, setFollowUpOn] = useState(d.followUpOn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const existing = read.candidates.find((c) => c.id === pick);
  const personName = existing?.name ?? name.trim();
  const first = personName.split(/\s+/)[0] || "them";
  const update = (key: string, patch: Partial<PromiseRow>) => setPromises((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!personName) return setError("Add who this was with.");
    if (withTouch && touchOn > today) return setError("A touch can't be in the future. Add it as a follow-up instead.");
    const review: QuickReview = {
      spaceId: read.spaceId,
      person: existing ? { kind: "existing", id: existing.id, name: existing.name } : { kind: "new", name: personName, company, position, whereMet: "" },
      touch: withTouch ? { type: touchType, occurredOn: touchOn, summary } : null,
      promises: promises.filter((p) => p.include).map((p) => ({ text: p.text, owner: p.owner, dueOn: p.dueOn || null })),
      followUpOn: followUpOn || null,
    };
    const { personId, captures } = quickCapturePlan(review);
    if (!captures.length) return setError("Nothing to save yet. Tick a touch or a promise, or add a follow-up date.");
    setError(null);
    setBusy(true);
    let queued = false;
    for (const c of captures) {
      const r = await sendCapture(c);
      if (!r.ok) {
        setBusy(false);
        return setError(r.message);
      }
      queued ||= r.queued;
    }
    setBusy(false);
    const parts = [
      review.person.kind === "new" ? "added" : null,
      review.touch ? "touch logged" : null,
      captures.filter((c) => c.kind === "promise").length ? "promises saved" : null,
    ].filter(Boolean);
    after({ ok: true, id: personId, queued }, `${first}: ${parts.join(", ")}.`);
    onDone();
    if (!queued) router.push(`/people/${personId}`);
  }

  return (
    <form onSubmit={save} className="grid gap-5" noValidate aria-label="Check what was read">
      <p className="text-small text-muted">
        {read.offline ? "Read on this device (you're offline). " : read.source === "ai" ? "Read with AI. " : ""}
        Check it, then save{spaceName ? ` to ${spaceName}` : ""}.{" "}
        <button type="button" onClick={onBack} className="font-[550] text-accent hover:underline">
          Change the line
        </button>
      </p>

      <fieldset className="grid gap-3">
        <legend className="pb-1.5 font-semibold">Who</legend>
        {read.candidates.length ? (
          <div className="grid gap-1">
            {read.candidates.map((c) => (
              <label key={c.id} className="flex min-h-11 items-center gap-3 rounded-md px-2 hover:bg-sunken">
                <input type="radio" name={`${uid}-who`} checked={pick === c.id} onChange={() => setPick(c.id)} />
                <span>
                  <span className="font-[550]">{c.name}</span>
                  {c.detail ? <span className="text-muted"> · {c.detail}</span> : null}
                </span>
              </label>
            ))}
            <label className="flex min-h-11 items-center gap-3 rounded-md px-2 hover:bg-sunken">
              <input type="radio" name={`${uid}-who`} checked={pick === "new"} onChange={() => setPick("new")} />
              <span className="font-[550]">Someone new</span>
            </label>
          </div>
        ) : null}
        {pick === "new" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name">{({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" />}</Field>
            <Field label="Role">{({ id }) => <Input id={id} value={position} onChange={(e) => setPosition(e.target.value)} maxLength={120} autoComplete="off" />}</Field>
            <Field label="Company">{({ id }) => <Input id={id} value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} autoComplete="off" />}</Field>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="pb-1.5 font-semibold">Touch</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={withTouch} onChange={(e) => setWithTouch(e.target.checked)} />
          Log a touch with {first}
        </label>
        {withTouch ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <Field label="How">
              {({ id }) => (
                <Select id={id} value={touchType} onChange={(e) => setTouchType(e.target.value as TouchType)}>
                  {touchTypes.map((t) => (
                    <option key={t} value={t}>
                      {touchTypeLabels[t]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="When">{({ id }) => <Input id={id} type="date" value={touchOn} max={today} onChange={(e) => setTouchOn(e.target.value)} />}</Field>
            <Field label="Summary" className="sm:col-span-2">
              {({ id }) => <Textarea id={id} rows={2} value={summary} maxLength={2000} onChange={(e) => setSummary(e.target.value)} />}
            </Field>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="pb-1.5 font-semibold">Promises</legend>
        {promises.length ? null : <p className="text-small text-muted">None found in the line.</p>}
        {promises.map((p, i) => (
          <div key={p.key} className="grid gap-2 rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-small">
              <input type="checkbox" checked={p.include} onChange={(e) => update(p.key, { include: e.target.checked })} />
              Save this promise
            </label>
            <Field label={`Promise ${i + 1}`}>{({ id }) => <Input id={id} value={p.text} maxLength={300} onChange={(e) => update(p.key, { text: e.target.value })} />}</Field>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Who owes it">
                {({ id }) => (
                  <Select id={id} value={p.owner} onChange={(e) => update(p.key, { owner: e.target.value as "me" | "them" })}>
                    <option value="me">You owe {first}</option>
                    <option value="them">{first} owes you</option>
                  </Select>
                )}
              </Field>
              <Field label="Due">{({ id }) => <Input id={id} type="date" value={p.dueOn} onChange={(e) => update(p.key, { dueOn: e.target.value })} />}</Field>
            </div>
          </div>
        ))}
        <div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setPromises((ps) => [
                ...ps,
                {
                  key: crypto.randomUUID(),
                  include: true,
                  text: "",
                  owner: "me",
                  dueOn: "",
                },
              ])
            }
          >
            Add a promise
          </Button>
        </div>
      </fieldset>

      <Field label="Follow up on" hint={`Optional. Adds “Follow up with ${first}” to Today on that day.`}>
        {({ id, describedBy }) => (
          <Input id={id} type="date" value={followUpOn} min={today} onChange={(e) => setFollowUpOn(e.target.value)} className="max-w-48" aria-describedby={describedBy} />
        )}
      </Field>

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
      </div>
    </form>
  );
}
