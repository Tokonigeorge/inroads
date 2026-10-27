"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/field";
import { startAiJobAction } from "./actions";
import { JobStatus } from "./job-status";

/**
 * Research someone, optionally with something you paste (their LinkedIn About, a bio, an event
 * page), and "Look up their world": who's around them, warm paths in, and openings.
 */
export function ResearchControls({
  personId,
  spaceId,
  name,
  label,
  aiEnabled,
  canLookUp,
  savedPasted = "",
}: {
  personId: string;
  spaceId: string;
  name: string;
  label: string;
  aiEnabled: boolean;
  canLookUp: boolean;
  /** What you pasted last time; research reuses it when you don't paste anything new. */
  savedPasted?: string;
}) {
  const router = useRouter();
  const [pasted, setPasted] = useState(savedPasted);
  const [jobId, setJobId] = useState<string | null>(null);
  const [lookupId, setLookupId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const first = name.split(/\s+/)[0];
  const off = !aiEnabled ? "AI features aren't set up on this server yet." : undefined;

  async function start(job: Record<string, unknown>, set: (id: string) => void) {
    setMessage(null);
    const r = await startAiJobAction(job);
    if (r.jobId) set(r.jobId);
    else setMessage(r.message ?? "Couldn't start that.");
  }

  return (
    <div className="grid gap-3">
      <details className="text-small" open={Boolean(savedPasted)}>
        <summary className="cursor-pointer text-muted hover:text-text">Give Inroads more to work with</summary>
        <div className="grid gap-1 pt-2">
          <Textarea
            aria-label={`More about ${first}`}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={4}
            maxLength={12000}
            placeholder={`Paste ${first}'s LinkedIn About, a bio or a speaker page. It helps find the right person.`}
          />
          <span className="text-muted">Optional. Kept on their profile and used again next time, so research finds the right person when the name is common.</span>
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={Boolean(off) || Boolean(jobId)}
          title={off}
          onClick={() => void start({ kind: "research", personId, spaceId, mode: "research", pasted: pasted.trim() || undefined }, setJobId)}
        >
          {label}
        </Button>
        {canLookUp ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={Boolean(off) || Boolean(lookupId)}
            title={off}
            onClick={() => void start({ kind: "lookup", spaceId, type: "person", q: name, personId, context: pasted.trim() || undefined }, setLookupId)}
          >
            Look up their world
          </Button>
        ) : null}
      </div>
      {jobId ? (
        <JobStatus
          jobId={jobId}
          onDone={() => {
            setJobId(null);
            setPasted("");
          }}
          onFailed={(error) => setTimeout(() => (setJobId(null), setMessage(error)), 0)}
        />
      ) : null}
      {lookupId ? <JobStatus jobId={lookupId} onDone={(r) => router.push(`/discover/${String(r.searchId)}`)} onFailed={(error) => setTimeout(() => (setLookupId(null), setMessage(error)), 0)} /> : null}
      {message ? (
        <p role="alert" className="text-small text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
