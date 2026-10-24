"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/ui/button";

/** Upload contacts or calendar files; the review page shows what will happen before anything is saved. */
export function FileImport({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const hint = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Uploading needs the handler below, so the input stays disabled until the page has hydrated.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("spaceId", spaceId);
    for (const f of Array.from(files)) body.append("files", f);
    try {
      const res = await fetch("/api/v1/imports", { method: "POST", body });
      const r = (await res.json().catch(() => ({}))) as { ok?: boolean; importId?: string; message?: string };
      if (r.ok && r.importId) return router.push(`/settings/imports/${r.importId}`);
      setError(r.message ?? "Those files couldn't be read.");
    } catch {
      setError("Couldn't upload. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="grid gap-2">
      <p id={hint} className="text-small text-muted">
        Contacts as .vcf (iPhone, Android, Google), .csv (Google, Outlook, LinkedIn connections) or a .zip from Google Takeout or LinkedIn. Calendars as .ics. Up to 4 MB at a time.
      </p>
      <input
        ref={input}
        type="file"
        multiple
        accept=".vcf,.vcard,.csv,.ics,.zip,text/vcard,text/x-vcard,text/csv,text/calendar,application/zip"
        aria-label="Choose files to import"
        aria-describedby={hint}
        className="sr-only"
        disabled={!ready || busy}
        onChange={(e) => void upload(e.target.files)}
      />
      <div>
        <Button size="sm" disabled={!ready || busy} onClick={() => input.current?.click()}>
          {busy ? "Reading files…" : "Choose files"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
