"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Job = { status: "queued" | "running" | "done" | "failed"; progress: { step?: string } | null; error: string | null; resultRef: Record<string, unknown> | null };

/**
 * Follows a background AI job, showing its work as it goes ("Searching for …", "Reading …"):
 * earlier steps ticked off, the current one spinning. Calls `onDone` with its result, then
 * refreshes the page's data.
 */
export function JobStatus({ jobId, onDone, onFailed }: { jobId: string; onDone?: (result: Record<string, unknown>) => void; onFailed?: () => void }) {
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async (): Promise<Job> => {
      const res = await fetch(`/api/v1/jobs/${jobId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    refetchInterval: (q) => (q.state.data?.status === "done" || q.state.data?.status === "failed" ? false : 1500),
  });
  const handled = useRef(false);
  // Every step seen so far, in order (polling can skip some; that's fine).
  const [trail, setTrail] = useState<string[]>([]);
  const step = data?.progress?.step;
  if (step && step !== "Done" && trail[trail.length - 1] !== step) setTrail((t) => [...t.filter((x) => x !== step), step]);
  useEffect(() => {
    if (handled.current || !data) return;
    if (data.status === "done") {
      handled.current = true;
      onDone?.(data.resultRef ?? {});
      router.refresh();
    } else if (data.status === "failed") {
      handled.current = true;
      onFailed?.();
    }
  }, [data, onDone, onFailed, router]);
  if (data?.status === "failed") {
    return (
      <p role="alert" className="text-small text-danger">
        {data.error}
      </p>
    );
  }
  if (data?.status === "done") return null;
  const shown = trail.length ? trail.slice(-4) : ["Starting"];
  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface p-3">
      <div className="shimmer h-1 rounded-full" aria-hidden />
      <ol className="grid gap-1 text-small" aria-label="Progress">
        {shown.map((x, i) => {
          const current = i === shown.length - 1;
          return (
            <li key={x} className={`rise flex items-center gap-2 ${current ? "font-[550]" : "text-muted"}`}>
              {current ? <Loader2 size={14} className="shrink-0 animate-spin text-accent" aria-hidden /> : <Check size={14} className="shrink-0 text-accent" aria-hidden />}
              {current ? (
                <span role="status" aria-live="polite">
                  {x}…
                </span>
              ) : (
                <span>{x}</span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-micro text-muted">You can leave this page; it carries on.</p>
    </div>
  );
}
