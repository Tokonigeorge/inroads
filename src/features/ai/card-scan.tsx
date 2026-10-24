"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/ui/button";
import { readCardAction } from "./actions";

/** Shrinks a photo to at most 1600px on the long side as JPEG, so it uploads fast on a phone. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.85));
}

/** Photograph a business card; the details open in the Add person form to check before saving. */
export function CardScan({ onDone, aiEnabled }: { onDone: () => void; aiEnabled: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const read = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      const blob = file.size > 300_000 ? await shrink(file).catch(() => file) : file;
      body.set("image", blob, "card.jpg");
      const r = await readCardAction(body);
      if (r.message || !r.fields) return setError(r.message ?? "Couldn't read that card.");
      onDone();
      router.push(`/people/new?${new URLSearchParams({ ...r.fields, from: "card" })}`);
    } finally {
      setBusy(false);
    }
  };
  if (!aiEnabled) return <p className="text-small text-muted">Reading cards needs AI, which isn&apos;t set up on this server yet.</p>;
  return (
    <div className="grid gap-3">
      <p className="text-small text-muted">Take a photo of the card. You&apos;ll check the details before anything is saved; the photo isn&apos;t kept.</p>
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Photo of a business card" onChange={(e) => void read(e.target.files?.[0])} />
      <div>
        <Button variant="primary" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Reading the card…" : "Take or choose a photo"}
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
