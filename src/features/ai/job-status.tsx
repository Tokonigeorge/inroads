"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type Job = { status: "queued" | "running" | "done" | "failed"; progress: { step?: string } | null; error: string | null; resultRef: Record<string, unknown> | null };

/** Follows a background AI job. Calls `onDone` with its result, then refreshes the page's data. */
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
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-small text-muted">
      <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent motion-reduce:animate-none" aria-hidden />
      {data?.progress?.step ?? "Starting"}… You can leave this page; it carries on.
    </p>
  );
}
