"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/ui/button";
import { Field, Input, Segmented, Textarea } from "@/ui/field";
import { Sheet } from "@/ui/sheet";
import { importChatAction } from "./actions";

/**
 * Paste a WhatsApp (or any) chat with this person. Touches, promises and details come back as
 * suggestions to accept. The text itself is never stored.
 */
export function ChatImportButton({ personId, name, spaces, aiEnabled, myName }: { personId: string; name: string; spaces: { id: string; name: string }[]; aiEnabled: boolean; myName: string }) {
  const [open, setOpen] = useState(false);
  if (!spaces.length) return null;
  return (
    <>
      <Button variant="ghost" disabled={!aiEnabled} title={aiEnabled ? undefined : "AI features aren't set up on this server yet."} onClick={() => setOpen(true)}>
        Import a chat
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={`Import a chat with ${name.split(/\s+/)[0]}`} description="In WhatsApp: open the chat, tap the name, Export chat, Without media. The text is read once and not kept.">
        {open ? <ChatImportForm personId={personId} spaces={spaces} myName={myName} onDone={() => setOpen(false)} /> : null}
      </Sheet>
    </>
  );
}

/** The paste-and-read form, used on a person's page and in the capture sheet. */
export function ChatImportForm({ personId, spaces, myName, onDone }: { personId: string; spaces: { id: string; name: string }[]; myName: string; onDone: () => void }) {
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const [text, setText] = useState("");
  const [me, setMe] = useState(myName);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const readFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5_000_000) return setError("That file is too large. Export the chat without media.");
    setText(await f.text());
  };
  if (result) {
    return (
      <div className="grid gap-3">
        <p>{result}</p>
        <p className="text-small text-muted">Review the suggestions on their page to add the touches and promises.</p>
        <div>
          <Button asChild size="sm">
            <Link href={`/people/${personId}`} onClick={onDone}>
              Review suggestions
            </Link>
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-4" aria-busy={pending}>
      {spaces.length > 1 ? <Segmented legend="Space" name="chat-space" value={spaceId} onChange={setSpaceId} options={spaces.map((s) => ({ value: s.id, label: s.name }))} /> : null}
      <Field label="Your name in the chat" hint="So Inroads knows which messages are yours.">
        {({ id, describedBy }) => <Input id={id} value={me} onChange={(e) => setMe(e.target.value)} aria-describedby={describedBy} />}
      </Field>
      <Field label="The chat">
        {({ id }) => <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Paste the chat, or choose the exported .txt file below" />}
      </Field>
      <input type="file" accept=".txt,text/plain" aria-label="Choose an exported chat file" onChange={(e) => void readFile(e.target.files?.[0])} className="text-small" />
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      <div>
        <Button
          variant="primary"
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await importChatAction({ spaceId, personId, transcript: text, me });
              if (r.message) return setError(r.message);
              setText("");
              setResult(`${r.summary ?? ""} ${r.suggestions ? `${r.suggestions} suggestions are ready.` : "Nothing new to add."}`.trim());
            })
          }
        >
          {pending ? "Reading the chat…" : "Read the chat"}
        </Button>
      </div>
    </div>
  );
}
