"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { whatsappDigits } from "@/domain/normalise";
import { Button } from "@/ui/button";
import { Segmented, Textarea } from "@/ui/field";
import { Sheet } from "@/ui/sheet";
import { useToast } from "@/ui/toast";
import { draftAction, logSentDraftAction } from "./actions";

const purposes = [
  { value: "checkin", label: "Check in" },
  { value: "followup", label: "Follow up" },
  { value: "thanks", label: "Thank you" },
  { value: "birthday", label: "Birthday" },
] as const;

/** Draft a message, edit it, open it in WhatsApp or email, then log it as a touch. */
export function DraftButton({ personId, name, spaces, aiEnabled }: { personId: string; name: string; spaces: { id: string; name: string }[]; aiEnabled: boolean }) {
  // "?draft=checkin" (from Today's "Going cold" list) opens it straight away.
  const asked = useSearchParams().get("draft");
  const purpose = purposes.find((p) => p.value === asked)?.value;
  const [open, setOpen] = useState(Boolean(purpose) && aiEnabled);
  if (!spaces.length) return null;
  return (
    <>
      <Button variant="ghost" disabled={!aiEnabled} title={aiEnabled ? undefined : "AI features aren't set up on this server yet."} onClick={() => setOpen(true)}>
        Draft a message
      </Button>
      <DraftSheet open={open} onOpenChange={setOpen} personId={personId} name={name} spaces={spaces} initialPurpose={purpose} />
    </>
  );
}

/** Write a message with AI, edit it, then open WhatsApp or email (or copy). Used on a person's page and from Today's cards. */
export function DraftSheet({
  open,
  onOpenChange,
  personId,
  name,
  spaces,
  initialPurpose = "checkin",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  name: string;
  spaces: { id: string; name: string }[];
  initialPurpose?: string;
}) {
  const setOpen = onOpenChange;
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const [purpose, setPurpose] = useState<string>(initialPurpose);
  const [text, setText] = useState("");
  const [contact, setContact] = useState<{ phone?: string | null; email?: string | null }>({});
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const first = name.split(/\s+/)[0];
  const generate = () =>
    start(async () => {
      setError(null);
      const r = await draftAction(personId, spaceId, purpose);
      if (r.message) return setError(r.message);
      setText(r.text ?? "");
      setContact({ phone: r.phone, email: r.email });
    });
  if (!spaces.length) return null;
  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSent(false); }} title={`Message ${first}`} description="Edit it before you send. Nothing is sent from Inroads.">
        <div className="grid gap-4" aria-busy={pending}>
          {spaces.length > 1 ? <Segmented legend="Which side of your life" name="draft-space" value={spaceId} onChange={setSpaceId} options={spaces.map((s) => ({ value: s.id, label: s.name }))} /> : null}
          <Segmented legend="What for" name="draft-purpose" value={purpose} onChange={setPurpose} options={purposes.map((p) => ({ value: p.value, label: p.label }))} />
          <div>
            <Button size="sm" variant={text ? "ghost" : "primary"} disabled={pending} onClick={generate}>
              {pending ? "Writing…" : text ? "Write another" : "Write a draft"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          ) : null}
          {text ? (
            <>
              <Textarea aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} rows={5} />
              <div className="flex flex-wrap gap-2">
                {contact.phone ? (
                  <Button asChild size="sm" variant="primary">
                    <a href={`https://wa.me/${whatsappDigits(contact.phone)}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" onClick={() => setSent(true)}>
                      Open in WhatsApp
                    </a>
                  </Button>
                ) : null}
                {contact.email ? (
                  <Button asChild size="sm">
                    <a href={`mailto:${contact.email}?body=${encodeURIComponent(text)}`} onClick={() => setSent(true)}>
                      Open in email
                    </a>
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(text); setSent(true); toast.show("Copied."); }}>
                  Copy
                </Button>
              </div>
              {sent ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-sunken p-3 text-small">
                  <span>Log this as a touch?</span>
                  <Button
                    size="sm"
                    onClick={() =>
                      start(async () => {
                        await logSentDraftAction(personId, spaceId, text);
                        setOpen(false);
                        setSent(false);
                        toast.show("Touch logged.");
                      })
                    }
                  >
                    Yes, log it
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSent(false)}>
                    Not now
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
