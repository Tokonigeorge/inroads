"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { roomKindLabels, roomKinds, type RoomInput, type RoomKind } from "@/contracts/rooms";
import { weekday } from "@/domain/dates";
import { freqLabels, nthChoicesFor, nthLabel, recurFreqs, type Nth, type RecurFreq } from "@/domain/recurrence";
import { zoneCity } from "@/domain/zoned";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { JobStatus } from "@/features/ai/job-status";
import { startAiJobAction } from "@/features/ai/actions";
import { quickGoalAction, roomDetailsAction, saveRoomAction } from "./actions";

export type RoomFormValues = {
  spaceId: string;
  title: string;
  kind: RoomKind;
  startsOn: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  tz: string;
  location: string | null;
  url: string | null;
  notes: string | null;
  freq: RecurFreq;
  byDays: number[] | null;
  nth: Nth | null;
  untilOn: string | null;
  goalId: string | null;
};

type SpaceChoice = { id: string; name: string; goals: { id: string; text: string }[] };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

/** Common zones first; the rest of the world after. */
function zoneOptions(current: string) {
  const common = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Africa/Cairo", "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Asia/Dubai"];
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {}
  return { common: [...new Set([current, ...common])], rest: all.filter((z) => !common.includes(z) && z !== current) };
}

export function RoomForm({ roomId, values, spaces, aiEnabled = false }: { roomId: string | null; values: RoomFormValues; spaces: SpaceChoice[]; aiEnabled?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prepId, setPrepId] = useState<string | null>(null);
  const [newGoals, setNewGoals] = useState<{ id: string; text: string; spaceId: string }[]>([]);
  const set = <K extends keyof RoomFormValues>(k: K, val: RoomFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const zones = useMemo(() => zoneOptions(values.tz), [values.tz]);
  const space = spaces.find((s) => s.id === v.spaceId);
  const goals = [...(space?.goals ?? []), ...newGoals.filter((g) => g.spaceId === v.spaceId)];
  const startDow = v.startsOn ? weekday(v.startsOn) : 1;
  const nthChoices = v.startsOn ? nthChoicesFor(v.startsOn) : [];
  const weekly = v.freq === "weekly" || v.freq === "biweekly";
  const monthly = v.freq === "monthly" || v.freq === "quarterly";
  const days = v.byDays?.length ? v.byDays : [startDow];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input: RoomInput = {
      ...v,
      byDays: weekly && !(days.length === 1 && days[0] === startDow) ? days : null,
      nth: monthly ? v.nth : null,
      untilOn: v.freq === "none" ? null : v.untilOn,
    };
    setBusy(true);
    const r = await saveRoomAction(roomId, input, prepId);
    setBusy(false);
    setErrors(r.fieldErrors ?? {});
    setMessage(r.message ?? null);
    if (r.ok && r.id) {
      toast.show(roomId ? "Room saved." : "Room added.");
      router.push(`/rooms/${r.id}`);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6" noValidate>
      <Field label="Name" error={errors.title}>
        {({ id, describedBy, invalid }) => (
          <Input id={id} value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={200} placeholder="Founders breakfast, fintech mixer…" aria-describedby={describedBy} aria-invalid={invalid} autoComplete="off" />
        )}
      </Field>
      {roomId ? null : (
        <FindDetails
          title={v.title}
          spaceId={v.spaceId}
          aiEnabled={aiEnabled}
          found={Boolean(prepId)}
          onFound={(searchId, d) => {
            setPrepId(searchId);
            setV((s) => ({
              ...s,
              notes: s.notes?.trim() ? s.notes : foundNotes(d),
              goalId: s.goalId ?? (d.goalId && goals.some((g) => g.id === d.goalId) ? d.goalId : null),
              title: d.title.trim() ? d.title.trim().slice(0, 200) : s.title,
              kind: d.when?.endsOn && d.when.endsOn !== d.when.startsOn ? "conference" : s.kind,
              startsOn: d.when?.startsOn || s.startsOn,
              startTime: d.when?.startsOn ? d.when.startTime || null : s.startTime,
              endTime: d.when?.startsOn ? d.when.endTime || null : s.endTime,
              allDay: d.when?.startsOn ? !d.when.startTime : s.allDay,
              tz: d.when?.timezone || s.tz,
              location: d.when?.venue || s.location,
              url: d.when?.url || d.website || s.url,
            }));
          }}
        />
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        {spaces.length > 1 ? (
          <Field label="Space" error={errors.spaceId}>
            {({ id, describedBy }) => (
              <Select id={id} value={v.spaceId} onChange={(e) => setV((s) => ({ ...s, spaceId: e.target.value, goalId: null }))} aria-describedby={describedBy}>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label="Type">
          {({ id }) => (
            <Select id={id} value={v.kind} onChange={(e) => set("kind", e.target.value as RoomKind)}>
              {roomKinds.map((k) => (
                <option key={k} value={k}>
                  {roomKindLabels[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <fieldset className="grid gap-4">
        <legend className="pb-1.5 text-small font-[550]">When</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={v.freq === "none" ? "Date" : "First date"} error={errors.startsOn}>
            {({ id, describedBy, invalid }) => <Input id={id} type="date" value={v.startsOn} onChange={(e) => setV((s) => ({ ...s, startsOn: e.target.value, nth: null, byDays: null }))} aria-describedby={describedBy} aria-invalid={invalid} />}
          </Field>
          {!v.allDay ? (
            <>
              <Field label="Starts" error={errors.startTime}>
                {({ id }) => <Input id={id} type="time" value={v.startTime ?? ""} onChange={(e) => set("startTime", e.target.value || null)} />}
              </Field>
              <Field label="Ends" hint="Optional." error={errors.endTime}>
                {({ id, describedBy }) => <Input id={id} type="time" value={v.endTime ?? ""} onChange={(e) => set("endTime", e.target.value || null)} aria-describedby={describedBy} />}
              </Field>
            </>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-small font-[550]">
          <input type="checkbox" checked={v.allDay} onChange={(e) => set("allDay", e.target.checked)} className="accent-[var(--accent)]" />
          All day
        </label>
        {!v.allDay ? (
          <Field label="Time zone" hint="Times are in this zone. Inroads shows them in yours." error={errors.tz}>
            {({ id, describedBy }) => (
              <Select id={id} value={v.tz} onChange={(e) => set("tz", e.target.value)} aria-describedby={describedBy}>
                <optgroup label="Common">
                  {zones.common.map((z) => (
                    <option key={z} value={z}>
                      {zoneCity(z)} ({z})
                    </option>
                  ))}
                </optgroup>
                {zones.rest.length ? (
                  <optgroup label="All time zones">
                    {zones.rest.map((z) => (
                      <option key={z} value={z}>
                        {z.replace(/_/g, " ")}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </Select>
            )}
          </Field>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="pb-1.5 text-small font-[550]">Repeats</legend>
        <Select aria-label="Repeats" value={v.freq} onChange={(e) => setV((s) => ({ ...s, freq: e.target.value as RecurFreq, nth: null, byDays: null }))}>
          {recurFreqs.map((f) => (
            <option key={f} value={f}>
              {freqLabels[f]}
            </option>
          ))}
        </Select>
        {weekly ? (
          <div role="group" aria-label="On these days" className="flex flex-wrap gap-1.5">
            {MON_FIRST.map((d) => (
              <label key={d} className="cursor-pointer rounded-md border border-border px-3 py-2 text-small font-[550] text-muted has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={days.includes(d)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...days, d] : days.filter((x) => x !== d);
                    set("byDays", next.length ? next : [startDow]);
                  }}
                />
                {DOW[d]}
              </label>
            ))}
          </div>
        ) : null}
        {monthly && v.startsOn ? (
          <div role="radiogroup" aria-label="On" className="grid gap-2">
            <label className="flex items-center gap-2">
              <input type="radio" name="monthlyOn" checked={!v.nth} onChange={() => set("nth", null)} className="accent-[var(--accent)]" />
              On day {Number(v.startsOn.slice(8))}
            </label>
            {nthChoices.map((c) => (
              <label key={`${c.n}-${c.dow}`} className="flex items-center gap-2">
                <input type="radio" name="monthlyOn" checked={v.nth?.n === c.n && v.nth?.dow === c.dow} onChange={() => set("nth", c)} className="accent-[var(--accent)]" />
                On {nthLabel(c)}
              </label>
            ))}
          </div>
        ) : null}
        {v.freq !== "none" ? (
          <Field label="Until" hint="Leave empty to keep repeating." error={errors.untilOn}>
            {({ id, describedBy, invalid }) => <Input id={id} type="date" value={v.untilOn ?? ""} min={v.startsOn} onChange={(e) => set("untilOn", e.target.value || null)} aria-describedby={describedBy} aria-invalid={invalid} className="w-auto" />}
          </Field>
        ) : null}
      </fieldset>

      <Field label="Where" error={errors.location}>
        {({ id }) => <Input id={id} value={v.location ?? ""} onChange={(e) => set("location", e.target.value)} maxLength={300} placeholder="Venue, area or video link" autoComplete="off" />}
      </Field>
      <Field label="Event page" hint="Optional." error={errors.url}>
        {({ id, describedBy, invalid }) => <Input id={id} type="url" inputMode="url" value={v.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="https://" aria-describedby={describedBy} aria-invalid={invalid} />}
      </Field>
      <GoalPicker
        spaceId={v.spaceId}
        goals={goals}
        value={v.goalId}
        error={errors.goalId}
        onChange={(goalId) => set("goalId", goalId)}
        onCreated={(g) => {
          setNewGoals((x) => [...x, { ...g, spaceId: v.spaceId }]);
          set("goalId", g.id);
        }}
      />
      <Field label="Notes" error={errors.notes}>
        {({ id }) => <Textarea id={id} rows={4} value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} maxLength={5000} />}
      </Field>
      {message ? (
        <p role="alert" className="text-small text-danger">
          {message}
        </p>
      ) : null}
      <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] -mx-4 border-t border-border bg-bg px-4 py-3 md:static md:mx-0 md:border-0 md:p-0">
        <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full md:w-auto">
          {busy ? "Saving…" : roomId ? "Save changes" : "Add room"}
        </Button>
      </div>
    </form>
  );
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Found = NonNullable<Awaited<ReturnType<typeof roomDetailsAction>>>;

/** Type a name, and the web fills in the rest: date, venue, event page. The same search becomes the room's prep. */
function FindDetails({ title, spaceId, aiEnabled, found, onFound }: { title: string; spaceId: string; aiEnabled: boolean; found: boolean; onFound: (searchId: string, d: Found) => void }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<Found | null>(null);
  if (!aiEnabled) return null;
  const ready = title.trim().length >= 3;
  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant={found ? "ghost" : "secondary"}
          disabled={!ready || Boolean(jobId)}
          onClick={async () => {
            setError(null);
            setNote(null);
            const r = await startAiJobAction({ kind: "lookup", spaceId, type: "event", q: title.trim() });
            if (r.jobId) setJobId(r.jobId);
            else setError(r.message ?? "Couldn't start the search.");
          }}
        >
          {found ? "Search again" : "Find details"}
        </Button>
        <span className="text-small text-muted">{ready ? "Searches the web for the date, venue and event page, and prepares who to meet." : "Type the event's name, then let Inroads find the rest."}</span>
      </div>
      {jobId ? (
        <JobStatus
          jobId={jobId}
          onDone={async (r) => {
            setJobId(null);
            const searchId = String(r.searchId ?? "");
            const d = searchId ? await roomDetailsAction(searchId) : null;
            if (!d) return setError("That search didn't come back. Fill it in by hand, or try again.");
            onFound(searchId, d);
            setSeen(d);
            const bits = [d.when?.startsOn ? "the date" : null, d.when?.venue ? "the venue" : null, d.when?.url || d.website ? "the event page" : null].filter(Boolean);
            setNote(
              `${bits.length ? `Filled in ${bits.join(", ")}. Check them before saving.` : "Couldn't confirm a date or venue, so those are unchanged."} ${d.people || d.openings ? `Your plan (${count(d.people, "person", "people")} to meet, ${count(d.openings, "opening", "openings")}) is saved with the room.` : ""}`.trim(),
            );
          }}
          onFailed={() => setJobId(null)}
        />
      ) : null}
      {note ? (
        <p role="status" className="text-small">
          {note}
        </p>
      ) : null}
      {seen && (seen.overview || seen.meet.length) ? (
        <div className="grid gap-1 border-t border-border pt-2 text-small">
          {seen.overview ? <p>{seen.overview}</p> : null}
          {seen.meet.length ? (
            <p className="text-muted">
              Who to meet: {seen.meet.map((m) => (m.role ? `${m.name} (${m.role})` : m.name)).join("; ")}
              {seen.people > seen.meet.length ? `, and ${seen.people - seen.meet.length} more` : ""}. The full plan is on the room once you save.
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** What Find details learned, kept in the room's notes so it's there on the day. */
function foundNotes(d: Found) {
  const w = d.when;
  return [
    d.overview.trim(),
    w?.startsOn && w.endsOn && w.endsOn !== w.startsOn ? `Runs ${w.startsOn} to ${w.endsOn}.` : "",
    d.facts.length ? d.facts.map((f) => `- ${f}`).join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 5000);
}

/** "Serves goal", with a way to make the goal right here instead of leaving the form. */
function GoalPicker({
  spaceId,
  goals,
  value,
  error,
  onChange,
  onCreated,
}: {
  spaceId: string;
  goals: { id: string; text: string }[];
  value: string | null;
  error?: string;
  onChange: (goalId: string | null) => void;
  onCreated: (g: { id: string; text: string }) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function create() {
    if (!text.trim()) return setMessage("Write the goal, e.g. Meet three seed investors.");
    setPending(true);
    const r = await quickGoalAction(spaceId, text);
    setPending(false);
    if (!r.id) return setMessage(r.message ?? "That goal didn't save.");
    onCreated({ id: r.id, text: r.text ?? text.trim() });
    setAdding(false);
    setText("");
    setMessage(null);
  }
  return (
    <div className="grid gap-2">
      <Field label="Serves goal" hint={goals.length ? "Rooms tied to a goal count towards its week." : "Tie this room to what you're working towards."} error={error}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            value={adding ? "__new" : (value ?? "")}
            onChange={(e) => {
              if (e.target.value === "__new") return setAdding(true);
              setAdding(false);
              onChange(e.target.value || null);
            }}
            aria-describedby={describedBy}
          >
            <option value="">None</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.text}
              </option>
            ))}
            <option value="__new">+ New goal…</option>
          </Select>
        )}
      </Field>
      {adding ? (
        <div className="grid gap-2 rounded-md border border-border bg-surface p-3">
          <div className="flex flex-wrap items-end gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void create();
                }
              }}
              placeholder="e.g. Meet three seed investors"
              aria-label="New goal"
              maxLength={140}
              autoComplete="off"
              className="min-w-0 flex-1 basis-56"
            />
            <Button type="button" size="md" disabled={pending} onClick={() => void create()}>
              Create goal
            </Button>
            <Button type="button" size="md" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-small text-muted">You can add its pipeline and target on the goal&apos;s page later.</p>
          {message ? (
            <p role="alert" className="text-small text-danger">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
