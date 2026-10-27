"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { JobStatus } from "@/features/ai/job-status";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/toast";
import { startExportAction } from "./actions";

type Restored = { people: number; events: number; touches: number; promises: number; goals: number };

/**
 * The prototype's Backup block (L992): "Download backup" makes one file with everything and
 * downloads it as soon as it's ready; "Restore from backup" adds a backup's people, rooms, touches,
 * promises and goals (an Inroads export or a prototype backup). Nothing you have is overwritten.
 */
export function Backup() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [restoring, setRestoring] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const router = useRouter();

  async function restore(f: File) {
    setRestoring(true);
    try {
      const body = new FormData();
      body.set("file", f);
      const res = await fetch("/api/v1/restore", { method: "POST", body });
      const r = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; restored?: Restored };
      if (!res.ok || !r.restored) return toast.show(r.message ?? "That backup couldn't be restored.");
      const { people, events } = r.restored;
      toast.show(people || events ? `Restored ${people} ${people === 1 ? "person" : "people"} and ${events} ${events === 1 ? "event" : "events"}.` : "Everything in that backup is already here.");
      router.refresh();
    } catch {
      toast.show("That backup couldn't be restored. Check your connection and try again.");
    } finally {
      setRestoring(false);
      if (file.current) file.current.value = "";
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-[13.5px] text-muted">Download everything as one file, or restore from a backup.</p>
      {jobId ? (
        <JobStatus
          jobId={jobId}
          onDone={(r) => {
            setJobId(null);
            if (r.exportId) {
              // Download it straight away, like the prototype's one-tap backup.
              const a = document.createElement("a");
              a.href = `/api/v1/exports/${String(r.exportId)}`;
              a.download = "";
              a.click();
            }
            toast.show("Backup saved.");
          }}
          onFailed={() => setJobId(null)}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending || Boolean(jobId)} onClick={() => start(async () => setJobId((await startExportAction()).jobId))}>
          Download backup
        </Button>
        <Button disabled={restoring} onClick={() => file.current?.click()}>
          {restoring ? "Restoring…" : "Restore from backup"}
        </Button>
        <input
          ref={file}
          type="file"
          accept=".zip,.json,application/zip,application/json"
          aria-label="Backup file"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void restore(f);
          }}
        />
      </div>
    </div>
  );
}
