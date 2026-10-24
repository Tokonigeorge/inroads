"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { socialLabels } from "@/contracts/people";
import type { ShareRead } from "@/domain/share";
import { QuickCapture } from "@/features/capture/quick-capture";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { addSharedPersonAction, discardShareAction } from "./actions";

type Space = { id: string; name: string };

function Discard({ shareId, label = "Discard" }: { shareId: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" disabled={pending} onClick={() => start(async () => (await discardShareAction(shareId), router.push("/today")))}>
      {label}
    </Button>
  );
}

/** A shared profile link: add the person, or open them if you already have them. */
export function SharedProfile({ shareId, read, spaces, spaceId, existing }: { shareId: string; read: Extract<ShareRead, { kind: "profile" }>; spaces: Space[]; spaceId: string; existing: { id: string; name: string } | null }) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (existing) {
    return (
      <div className="grid gap-4">
        <p>
          <Link href={`/people/${existing.id}`} className="font-[550] text-accent hover:underline">
            {existing.name}
          </Link>{" "}
          is already in Inroads with this {socialLabels[read.social]} link.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="primary">
            <Link href={`/people/${existing.id}`} onClick={() => void discardShareAction(shareId)}>
              Open {existing.name.split(/\s+/)[0]}
            </Link>
          </Button>
          <Discard shareId={shareId} label="Done" />
        </div>
      </div>
    );
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const r = await addSharedPersonAction({
        shareId,
        spaceId: String(f.get("spaceId") ?? spaceId),
        name: String(f.get("name") ?? ""),
        position: String(f.get("position") ?? ""),
        company: String(f.get("company") ?? ""),
        social: read.social,
        url: read.url,
        note: String(f.get("note") ?? ""),
      });
      if (!r.ok || !r.personId) return setError(r.message ?? "That couldn't be saved.");
      toast.show(`${String(f.get("name"))} added.`);
      router.push(`/people/${r.personId}`);
    });
  }

  return (
    <form onSubmit={submit} className="grid max-w-[560px] gap-5" noValidate>
      <p className="text-small text-muted">
        {socialLabels[read.social]}:{" "}
        <a href={read.url} target="_blank" rel="noreferrer noopener" className="break-all text-accent hover:underline">
          {read.url.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      </p>
      <Field label="Name" error={error && !read.name ? error : undefined}>
        {({ id, describedBy, invalid }) => <Input id={id} name="name" defaultValue={read.name ?? ""} maxLength={120} autoComplete="off" required aria-describedby={describedBy} aria-invalid={invalid} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role">{({ id }) => <Input id={id} name="position" defaultValue={read.position ?? ""} maxLength={120} autoComplete="off" />}</Field>
        <Field label="Company">{({ id }) => <Input id={id} name="company" defaultValue={read.company ?? ""} maxLength={120} autoComplete="off" />}</Field>
      </div>
      {spaces.length > 1 ? (
        <Field label="Space">
          {({ id }) => (
            <Select id={id} name="spaceId" defaultValue={spaceId}>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      <Field label="Note" hint="Optional. Why you saved them, or where you came across them.">
        {({ id, describedBy }) => <Textarea id={id} name="note" rows={2} defaultValue={read.note ?? ""} maxLength={500} aria-describedby={describedBy} />}
      </Field>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Adding…" : "Add person"}
        </Button>
        <Discard shareId={shareId} />
      </div>
    </form>
  );
}

/** Shared text (a WhatsApp message, a note): read it like a quick capture. */
export function SharedText({ shareId, text }: { shareId: string; text: string }) {
  return (
    <div className="grid max-w-[640px] gap-4">
      {text.length > 1000 ? <p className="text-small text-muted">Only the first 1,000 characters are read. Trim it to the part that matters.</p> : null}
      <QuickCapture initialLine={text.slice(0, 1000)} hint="Check who it's about and what was promised" onDone={() => void discardShareAction(shareId)} />
      <div>
        <Discard shareId={shareId} />
      </div>
    </div>
  );
}
