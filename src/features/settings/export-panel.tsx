"use client";

import { useState, useTransition } from "react";
import { JobStatus } from "@/features/ai/job-status";
import { Button } from "@/ui/button";
import { startExportAction } from "./actions";

export type ExportView = { id: string; filename: string; size: string; made: string; until: string } | null;

/** Settings → Data: make an export in the background, then download it. */
export function ExportPanel({ latest }: { latest: ExportView }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div id="export" className="grid gap-3">
      <p className="text-muted">
        Download everything as a .zip: <code className="text-small">inroads.json</code> with all your data, plus spreadsheets of your people, touches, promises and rooms.
        Connected-account passwords and tokens are never included.
      </p>
      {latest && !jobId ? (
        <p className="text-small">
          <a href={`/api/v1/exports/${latest.id}`} download={latest.filename} className="font-[550] text-accent hover:underline">
            Download {latest.filename}
          </a>
          <span className="text-muted">
            {" "}
            · {latest.size} · made {latest.made}, available until {latest.until}
          </span>
        </p>
      ) : null}
      {jobId ? <JobStatus jobId={jobId} onDone={() => setJobId(null)} onFailed={() => setJobId(null)} /> : null}
      <div>
        <Button disabled={pending || Boolean(jobId)} onClick={() => start(async () => setJobId((await startExportAction()).jobId))}>
          {latest ? "Make a new export" : "Export your data"}
        </Button>
      </div>
    </div>
  );
}
