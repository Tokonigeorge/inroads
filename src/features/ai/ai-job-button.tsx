"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "@/ui/button";
import { startAiJobAction } from "./actions";
import { JobStatus } from "./job-status";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/** A one-line outcome for jobs that don't open a result of their own. */
function ResultLine({ r }: { r: Record<string, unknown> }) {
  if (typeof r.scored !== "number") return null;
  const s = typeof r.suggestions === "number" ? r.suggestions : 0;
  return (
    <p role="status" className="text-small text-muted">
      Scored {plural(r.scored, "person", "people")}.{" "}
      {s ? (
        <Link href="/suggestions" className="font-[550] text-accent hover:underline">
          Review {plural(s, "strong fit", "strong fits")} for your goals
        </Link>
      ) : (
        "No new strong fits for your goals this time."
      )}
    </p>
  );
}

/** Starts a background AI job and shows its progress underneath. */
export function AiJobButton({
  job,
  label,
  aiEnabled,
  variant = "secondary",
  size = "sm",
  onDone,
}: {
  job: Record<string, unknown>;
  label: string;
  aiEnabled: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  onDone?: (result: Record<string, unknown>) => void;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [pending, start] = useTransition();
  if (!aiEnabled) {
    return (
      <Button size={size} variant={variant} disabled title="AI features aren't set up on this server yet.">
        {label}
      </Button>
    );
  }
  return (
    <div className="grid gap-2">
      <div>
        <Button
          size={size}
          variant={variant}
          disabled={pending || Boolean(jobId)}
          onClick={() =>
            start(async () => {
              setMessage(null);
              setResult(null);
              const r = await startAiJobAction(job);
              if (r.jobId) setJobId(r.jobId);
              else setMessage(r.message ?? "Couldn't start that.");
            })
          }
        >
          {label}
        </Button>
      </div>
      {jobId ? (
        <JobStatus
          key={jobId}
          jobId={jobId}
          onDone={(r) => {
            setJobId(null);
            setResult(r);
            onDone?.(r);
          }}
          // Keep the reason on screen after the progress box goes.
          onFailed={(error) => setTimeout(() => (setJobId(null), setMessage(error)), 0)}
        />
      ) : null}
      {result ? <ResultLine r={result} /> : null}
      {message ? (
        <p role="alert" className="text-small text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
