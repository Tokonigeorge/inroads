"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/ui/button";
import { Input, Segmented, Select, Textarea } from "@/ui/field";
import { startAiJobAction } from "./actions";
import { JobStatus } from "./job-status";

/* The prototype's decoder (L898–903): three kinds, one search row, and what you already know. */
const types = [
  { value: "person", label: "Person", placeholder: "A founder, investor or exec you want to meet" },
  { value: "place", label: "Place", placeholder: "A company, venue, hub or city" },
  { value: "event", label: "Event", placeholder: "A conference, mixer or summit" },
] as const;
type Kind = (typeof types)[number]["value"];

export function LookupForm({
  spaces,
  defaultSpaceId,
  aiEnabled,
  initialQ = "",
  initialType = "event",
}: {
  spaces: { id: string; name: string }[];
  defaultSpaceId: string;
  aiEnabled: boolean;
  initialQ?: string;
  initialType?: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<Kind>(types.find((t) => t.value === initialType)?.value ?? (initialType === "company" ? "place" : "event"));
  const [q, setQ] = useState(initialQ);
  const [context, setContext] = useState("");
  const [spaceId, setSpaceId] = useState(defaultSpaceId);
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3"
      noValidate
      aria-label="Room decoder"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim().length < 2) return setMessage("Type what to decode.");
        start(async () => {
          setMessage(null);
          const r = await startAiJobAction({ kind: "lookup", spaceId, type, q: q.trim(), context: context.trim() || undefined });
          if (r.jobId) setJobId(r.jobId);
          else setMessage(r.message ?? "Couldn't start that.");
        });
      }}
    >
      <Segmented legend="Search type" hideLegend name="lookup-type" value={type} onChange={setType} options={types.map((t) => ({ value: t.value, label: t.label }))} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={200}
          placeholder={types.find((t) => t.value === type)?.placeholder}
          aria-label="What to decode"
          autoComplete="off"
        />
        <Button type="submit" variant="primary" disabled={!aiEnabled || pending || Boolean(jobId)} title={aiEnabled ? undefined : "AI features aren't set up on this server yet."}>
          Decode
        </Button>
      </div>
      <details open={Boolean(context)} className="text-[14px]">
        <summary className="cursor-pointer font-semibold text-muted">Add what you already know</summary>
        <div className="grid gap-1 pt-2">
          <Textarea
            aria-label="What you already know"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            maxLength={12000}
            placeholder="Paste a speaker list, an event page, a company About section…"
          />
          <span className="hint">Optional. Inroads searches the web itself; pasted material still helps it pick the right one.</span>
        </div>
      </details>
      {spaces.length > 1 ? (
        <label className="flex flex-wrap items-center gap-2 text-[13.5px] text-muted">
          Warm paths from
          <Select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} aria-label="Space" className="h-9 w-auto">
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      {message ? (
        <p role="alert" className="text-small text-danger">
          {message}
        </p>
      ) : null}
      {jobId ? <JobStatus jobId={jobId} onDone={(r) => router.push(`/discover/${String(r.searchId)}`)} onFailed={(error) => (setJobId(null), setMessage(error))} /> : null}
    </form>
  );
}
