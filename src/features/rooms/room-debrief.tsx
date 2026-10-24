"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { PersonPicker } from "@/features/people/person-picker";
import { Button } from "@/ui/button";
import { Field, Input, Segmented } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { saveRoomDebriefAction, skipRoomSessionAction } from "./actions";

type Linked = { id: string; name: string; detail: string; metThere: boolean };
type Row = { key: string; personId?: string; name: string; detail: string; met: boolean; note: string; company?: string };
const followUps = [
  { value: "1", label: "Tomorrow" },
  { value: "2", label: "In 2 days" },
  { value: "0", label: "No follow-up" },
] as const;

/** Loop A, step 3: confirm who you met at a session, then follow-ups are scheduled. */
export function RoomDebrief({ roomId, roomTitle, spaceId, occurrenceOn, linked }: { roomId: string; roomTitle: string; spaceId: string; occurrenceOn: string; linked: Linked[] }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(() => linked.map((p) => ({ key: p.id, personId: p.id, name: p.name, detail: p.detail, met: p.metThere, note: "" })));
  const [adding, setAdding] = useState<"none" | "known" | "new">(linked.length ? "none" : "new");
  const [followUp, setFollowUp] = useState<(typeof followUps)[number]["value"]>("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const met = rows.filter((r) => r.met);

  function addNew(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    if (!name) return setError("Add their name.");
    const company = String(f.get("company") ?? "").trim();
    setRows((rs) => [...rs, { key: crypto.randomUUID(), name, company, detail: company, met: true, note: "" }]);
    setError(null);
    e.currentTarget.reset();
  }

  function save() {
    if (!met.length) return setError("Tick at least one person, or choose “I didn't go”.");
    setError(null);
    start(async () => {
      const r = await saveRoomDebriefAction({
        eventId: roomId,
        occurrenceOn,
        followUpInDays: Number(followUp) as 0 | 1 | 2,
        met: met.map((m) => (m.personId ? { personId: m.personId, note: m.note } : { id: m.key, name: m.name, company: m.company ?? "", note: m.note })),
      });
      if (!r.ok) return setError(r.message ?? "That couldn't be saved.");
      const n = r.people ?? met.length;
      toast.show(`${n === 1 ? "1 person" : `${n} people`} from ${roomTitle} saved.${followUp !== "0" ? ` Follow-ups are on Today ${followUp === "1" ? "tomorrow" : "in 2 days"}.` : ""}`);
      router.push(`/rooms/${roomId}`);
    });
  }

  function skip() {
    start(async () => {
      await skipRoomSessionAction(roomId, occurrenceOn);
      toast.show("Noted that you didn't go.");
      router.push("/today");
    });
  }

  return (
    <div className="grid gap-8">
      <section className="grid gap-3" aria-labelledby="met-heading">
        <h2 id="met-heading" className="text-title font-semibold">
          Who you met
        </h2>
        {rows.length ? (
          <ul className="grid gap-2">
            {rows.map((r) => (
              <li key={r.key} className="grid gap-2 rounded-md border border-border p-3">
                <label className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" checked={r.met} onChange={(e) => update(r.key, { met: e.target.checked })} />
                  <span>
                    <span className="font-[550]">{r.name}</span>
                    {r.detail ? <span className="text-muted"> · {r.detail}</span> : null}
                    {!r.personId ? <span className="text-muted"> · new</span> : null}
                  </span>
                </label>
                {r.met ? (
                  <Field label={`What you talked about with ${r.name.split(/\s+/)[0]}`} hint="Optional.">
                    {({ id, describedBy }) => <Input id={id} value={r.note} maxLength={500} onChange={(e) => update(r.key, { note: e.target.value })} aria-describedby={describedBy} />}
                  </Field>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No one is linked to this room yet. Add the people you met below.</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={adding === "new" ? "secondary" : "ghost"} onClick={() => setAdding(adding === "new" ? "none" : "new")}>
            Add someone new
          </Button>
          <Button size="sm" variant={adding === "known" ? "secondary" : "ghost"} onClick={() => setAdding(adding === "known" ? "none" : "known")}>
            Add someone you know
          </Button>
        </div>
        {adding === "new" ? (
          <form onSubmit={addNew} className="grid gap-3 rounded-md bg-sunken p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" noValidate aria-label="Add someone new">
            <Field label="Name">{({ id }) => <Input id={id} name="name" maxLength={120} autoComplete="off" />}</Field>
            <Field label="Company">{({ id }) => <Input id={id} name="company" maxLength={120} autoComplete="off" />}</Field>
            <Button type="submit">Add</Button>
          </form>
        ) : adding === "known" ? (
          <div className="rounded-md bg-sunken p-3">
            <PersonPicker
              spaceId={spaceId}
              onPick={(p) => {
                setRows((rs) => (rs.some((r) => r.personId === p.id) ? rs.map((r) => (r.personId === p.id ? { ...r, met: true } : r)) : [...rs, { key: p.id, personId: p.id, name: p.name, detail: "", met: true, note: "" }]));
                setAdding("none");
              }}
            />
          </div>
        ) : null}
      </section>

      <Segmented legend="Follow up" name="follow-up" value={followUp} onChange={setFollowUp} options={followUps.map((f) => ({ value: f.value, label: f.label }))} />

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : met.length ? `Save ${met.length === 1 ? "1 person" : `${met.length} people`}` : "Save"}
        </Button>
        <Button variant="ghost" onClick={skip} disabled={pending}>
          I didn&apos;t go
        </Button>
      </div>
    </div>
  );
}
