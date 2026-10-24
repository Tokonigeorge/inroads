"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/ui/button";
import { Field, Input, Segmented, Select, Textarea } from "@/ui/field";
import { startAiJobAction } from "./actions";
import { JobStatus } from "./job-status";

const types = [
  { value: "event", label: "Event" },
  { value: "company", label: "Company" },
  { value: "person", label: "Person" },
  { value: "place", label: "Place" },
] as const;

export function LookupForm({ spaces, defaultSpaceId, aiEnabled }: { spaces: { id: string; name: string }[]; defaultSpaceId: string; aiEnabled: boolean }) {
  const router = useRouter();
  const [type, setType] = useState<string>("event");
  const [q, setQ] = useState("");
  const [context, setContext] = useState("");
  const [spaceId, setSpaceId] = useState(defaultSpaceId);
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="grid max-w-[560px] gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim().length < 2) return setMessage("Type what to look up.");
        start(async () => {
          setMessage(null);
          const r = await startAiJobAction({ kind: "lookup", spaceId, type, q: q.trim(), context: context.trim() || undefined });
          if (r.jobId) setJobId(r.jobId);
          else setMessage(r.message ?? "Couldn't start that.");
        });
      }}
    >
      <Segmented legend="What is it" name="lookup-type" value={type} onChange={setType} options={types.map((t) => ({ value: t.value, label: t.label }))} />
      <Field label="Name" hint="e.g. Lagos Startup Week, Kestrel Ventures, Adaeze Okafor">
        {({ id, describedBy }) => <Input id={id} value={q} onChange={(e) => setQ(e.target.value)} maxLength={200} aria-describedby={describedBy} autoComplete="off" />}
      </Field>
      {spaces.length > 1 ? (
        <Field label="Space" hint="Warm paths come from people in this Space only.">
          {({ id, describedBy }) => (
            <Select id={id} value={spaceId} onChange={(e) => setSpaceId(e.target.value)} aria-describedby={describedBy}>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      <Field label="Anything to add (optional)" hint="Paste an event page, an agenda or a bio to help find the right one.">
        {({ id, describedBy }) => <Textarea id={id} value={context} onChange={(e) => setContext(e.target.value)} rows={3} aria-describedby={describedBy} />}
      </Field>
      {message ? (
        <p role="alert" className="text-small text-danger">
          {message}
        </p>
      ) : null}
      {jobId ? <JobStatus jobId={jobId} onDone={(r) => router.push(`/rooms/lookup/${String(r.searchId)}`)} onFailed={() => setJobId(null)} /> : null}
      <div>
        <Button type="submit" variant="primary" disabled={!aiEnabled || pending || Boolean(jobId)} title={aiEnabled ? undefined : "AI features aren't set up on this server yet."}>
          Look it up
        </Button>
      </div>
    </form>
  );
}
