"use client";

import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button } from "@/ui/button";

type Job = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  progress: { step?: string; done?: number; summary?: { contacts?: Summary | null; calendar?: CalSummary | null } } | null;
  error: string | null;
};
type Summary = { found: number; added: number; updated: number };
type CalSummary = { logged: number; newPeople: number; rooms: number };

async function fetchJob(id: string): Promise<Job> {
  const res = await fetch(`/api/v1/jobs/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

const n = (x: number, one: string, many: string) => `${x.toLocaleString("en-GB")} ${x === 1 ? one : many}`;

function summaryLine(s: Job["progress"]): string {
  const c = s?.summary?.contacts;
  const cal = s?.summary?.calendar;
  const parts: string[] = [];
  if (c) parts.push(`${n(c.added, "new person", "new people")}, ${n(c.updated, "updated", "updated")}`);
  if (cal) parts.push(`${n(cal.rooms, "room", "rooms")} and ${n(cal.logged, "past meeting", "past meetings")} from your calendar`);
  return parts.length ? `${parts.join("; ")}.` : "Everything was already up to date.";
}

/** Live status of a sync. Polls once a second while it runs, then refreshes the page's data. */
export function JobProgress({ jobId, onDismiss }: { jobId: string; onDismiss?: () => void }) {
  const router = useRouter();
  const { data, isError } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJob(jobId),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === "done" || q.state.data.status === "failed") ? false : 1000),
    retry: 3,
  });
  const finished = data?.status === "done" || data?.status === "failed";
  const refreshed = useRef(false);
  useEffect(() => {
    if (finished && !refreshed.current) {
      refreshed.current = true;
      // Drop the job from the address so a reload doesn't bring back a finished sync.
      const url = new URL(window.location.href);
      if (url.searchParams.get("job") === jobId) {
        url.searchParams.delete("job");
        router.replace(`${url.pathname}${url.search}${url.hash}` as Route, { scroll: false });
      } else router.refresh();
    }
  }, [finished, router, jobId]);

  const step = data?.progress?.step ?? "Starting";
  const done = data?.progress?.done;
  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface p-4" role="status" aria-live="polite">
      {data?.status === "failed" ? (
        <>
          <p className="font-[550]">The sync didn&apos;t finish</p>
          <p className="text-small text-muted">{data.error}</p>
        </>
      ) : data?.status === "done" ? (
        <>
          <p className="font-[550]">Sync finished</p>
          <p className="text-small text-muted">{summaryLine(data.progress)}</p>
          {(data.progress?.summary?.contacts?.added ?? 0) + (data.progress?.summary?.calendar?.newPeople ?? 0) > 0 ? (
            <div>
              <Button asChild variant="primary" size="sm">
                <Link href="/sort">Sort new people</Link>
              </Button>
            </div>
          ) : null}
        </>
      ) : isError ? (
        <p className="text-small text-muted">Can&apos;t check on the sync right now. It keeps running; refresh in a minute.</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent motion-reduce:animate-none" aria-hidden />
            <p className="font-[550]">
              {step}
              {done ? ` (${done.toLocaleString("en-GB")} so far)` : ""}
            </p>
          </div>
          <p className="text-small text-muted">You can leave this page. The sync carries on.</p>
        </>
      )}
      {finished && onDismiss ? (
        <div>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  );
}
