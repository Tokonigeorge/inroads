"use client";

import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "@/ui/button";
import { startAiJobAction } from "./actions";
import { JobStatus } from "./job-status";

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
              const r = await startAiJobAction(job);
              if (r.jobId) setJobId(r.jobId);
              else setMessage(r.message ?? "Couldn't start that.");
            })
          }
        >
          {label}
        </Button>
      </div>
      {jobId ? <JobStatus key={jobId} jobId={jobId} onDone={(r) => { setJobId(null); onDone?.(r); }} onFailed={() => setTimeout(() => setJobId(null), 0)} /> : null}
      {message ? (
        <p role="alert" className="text-small text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
