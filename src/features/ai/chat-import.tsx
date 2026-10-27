"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { sendCapture } from "@/features/offline/outbox";
import { fetchPeople } from "@/features/people/person-picker";
import { chatTranscript, parseChat, type ParsedChat } from "@/importers/chat";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { Sheet } from "@/ui/sheet";
import { useToast } from "@/ui/toast";
import { acceptSuggestionAction, importChatAction, pendingSuggestionsAction } from "./actions";
import type { SuggestionView } from "./suggestion-list";

/**
 * Paste a WhatsApp (or any) chat with this person. Touches, promises and details come back as
 * suggestions to accept. The text itself is never stored.
 */
export function ChatImportButton({
  personId,
  name,
  spaces,
  aiEnabled,
  myName,
  label = "Import a chat",
}: {
  personId: string;
  name: string;
  spaces: { id: string; name: string }[];
  aiEnabled: boolean;
  myName: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!spaces.length) return null;
  return (
    <>
      <Button variant="ghost" disabled={!aiEnabled} title={aiEnabled ? undefined : "AI features aren't set up on this server yet."} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={`Import a chat with ${name.split(/\s+/)[0]}`}>
        {open ? <ChatImportForm person={{ id: personId, name }} spaces={spaces} myName={myName} onDone={() => setOpen(false)} /> : null}
      </Sheet>
    </>
  );
}

type Target = { id: string; name: string };

/**
 * The prototype's "Import a chat" (L1196–1233), in three steps: choose the export or paste it;
 * say which one is you and whose chat it is (someone new is fine); then check what was found and
 * save it to them in one tap. Used on a person's record and from People and capture.
 */
export function ChatImportForm({
  person,
  spaces,
  myName,
  onDone,
}: {
  person?: Target;
  spaces: { id: string; name: string }[];
  myName: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<"input" | "map" | "review">("input");
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedChat | null>(null);
  const [me, setMe] = useState(myName);
  const [matches, setMatches] = useState<Target[]>([]);
  const [target, setTarget] = useState(person?.id ?? "");
  const [newName, setNewName] = useState("");
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const [review, setReview] = useState<{ summary: string; sentiment?: string; person: Target; items: SuggestionView[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("input");
    setRaw("");
    setFileName("");
    setParsed(null);
    setReview(null);
    setError(null);
  };

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5_000_000) return setError("That file is too large. Export the chat without media.");
    setFileName(f.name);
    setRaw(await f.text());
  };

  const read = () =>
    start(async () => {
      setError(null);
      if (raw.trim().length < 20) return setError("Choose the exported file, or paste more of the conversation.");
      const p = parseChat(raw);
      setParsed(p);
      // The person who isn't you is probably who it's with.
      const names = p.participants.map((x) => x.name);
      const firstOf = (n: string) => n.trim().toLowerCase().split(/\s+/)[0] ?? "";
      // You: your own first name if it's there, else whoever isn't the person this chat is for.
      const guessMe =
        names.find((n) => myName && firstOf(n) === firstOf(myName)) ??
        (person ? names.find((n) => firstOf(n) !== firstOf(person.name)) : undefined) ??
        names[names.length > 1 ? 1 : 0] ??
        myName;
      setMe(guessMe ?? "");
      const other = names.find((n) => n !== guessMe) ?? "";
      setNewName(person ? "" : other);
      if (!person && other) {
        const found = await fetchPeople({ q: other.split(/\s+/)[0], limit: "8" }).catch(() => ({ items: [] }));
        const list = found.items.map((x) => ({ id: x.id, name: x.name }));
        setMatches(list);
        setTarget(list[0]?.id ?? "__new");
      } else if (!person) setTarget("__new");
      setStep("map");
    });

  const extract = () =>
    start(async () => {
      setError(null);
      let who: Target | null = person && target === person.id ? person : (matches.find((m) => m.id === target) ?? null);
      if (target === "__new") {
        const name = newName.trim();
        if (!name) return setError("Add their name.");
        const id = crypto.randomUUID();
        const r = await sendCapture({ kind: "person", data: { id, identity: { name, emails: [], phones: [] }, membership: { spaceId, whereMet: "" } } });
        if (!r.ok) return setError(r.message);
        who = { id, name };
      }
      if (!who) return setError("Choose who the chat is with.");
      const transcript = parsed ? chatTranscript(parsed, raw) : raw;
      const r = await importChatAction({ spaceId, personId: who.id, transcript, me: parsed?.plain ? me : me || myName });
      if (r.message) return setError(r.message);
      const items = await pendingSuggestionsAction(who.id);
      setReview({ summary: r.summary ?? "", person: who, items });
      setStep("review");
    });

  const save = () =>
    start(async () => {
      if (!review) return;
      let saved = 0;
      for (const s of review.items) if ((await acceptSuggestionAction(s.id)).ok) saved++;
      const moments = review.items.filter((s) => s.kind === "interaction").length;
      const promises = review.items.filter((s) => s.kind === "commitment").length;
      toast.show(saved ? `Saved ${moments} ${moments === 1 ? "moment" : "moments"} and ${promises} ${promises === 1 ? "promise" : "promises"} to ${review.person.name}.` : `Nothing new to add to ${review.person.name}.`);
      onDone();
      router.push(`/people/${review.person.id}`);
    });

  const err = error ? (
    <p role="alert" className="text-small text-danger">
      {error}
    </p>
  ) : null;

  if (step === "input") {
    return (
      <div className="grid gap-4" aria-busy={pending}>
        <p className="text-[14.5px] text-muted">
          WhatsApp: open the chat → Export chat → Without media, then pick the .txt. Telegram: Export chat history as JSON. You can also paste any message thread or email chain.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => fileRef.current?.click()}>
            Choose a file
          </Button>
          {fileName ? <span className="text-[13.5px] text-muted">{fileName}</span> : null}
          <input ref={fileRef} type="file" accept=".txt,.json,text/plain,application/json" aria-label="Choose an exported chat file" className="sr-only" onChange={(e) => void readFile(e.target.files?.[0])} />
        </div>
        <Field label="Or paste the conversation">
          {({ id }) => (
            <Textarea
              id={id}
              aria-label="The chat"
              value={fileName ? "" : raw}
              onChange={(e) => {
                setFileName("");
                setRaw(e.target.value);
              }}
              rows={8}
              placeholder="[12/10/2026, 09:14] Ada: Great meeting you…"
            />
          )}
        </Field>
        {err}
        <div>
          <Button disabled={pending} onClick={read}>
            Read conversation
          </Button>
        </div>
      </div>
    );
  }

  if (step === "map" && parsed) {
    const fmt = (d?: string) => (d ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)) : "");
    return (
      <div className="grid gap-4" aria-busy={pending}>
        <p className="text-[14.5px] text-muted">
          {parsed.msgs.length ? `${parsed.msgs.length.toLocaleString("en-GB")} messages${parsed.from ? ` from ${fmt(parsed.from)} to ${fmt(parsed.to)}` : ""}.` : "Free-form text: Inroads will read it as it is."}
        </p>
        {parsed.participants.length ? (
          <Field label="Which one is you?">
            {({ id }) => (
              <Select id={id} value={me} onChange={(e) => setMe(e.target.value)}>
                {parsed.participants.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.n})
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <Field label="Your name in the chat" hint="So Inroads knows which messages are yours.">
            {({ id, describedBy }) => <Input id={id} value={me} onChange={(e) => setMe(e.target.value)} aria-describedby={describedBy} />}
          </Field>
        )}
        {person ? (
          <p className="text-[14.5px]">
            Saving what Inroads finds to <b>{person.name}</b>.
          </p>
        ) : (
          <>
            <Field label="Save what Inroads finds to">
              {({ id }) => (
                <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)}>
                  {matches.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                  <option value="__new">New person{newName ? `: ${newName}` : ""}</option>
                </Select>
              )}
            </Field>
            {target === "__new" ? (
              <Field label="New person's name">{({ id }) => <Input id={id} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} autoComplete="off" />}</Field>
            ) : null}
          </>
        )}
        {spaces.length > 1 ? (
          <Field label="Space">
            {({ id }) => (
              <Select id={id} value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {err}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={pending} onClick={extract}>
            {pending ? "Reading the chat…" : "Read the chat"}
          </Button>
          <Button variant="ghost" onClick={reset}>
            Start over
          </Button>
        </div>
      </div>
    );
  }

  if (step === "review" && review) {
    const of = (k: string) => review.items.filter((s) => s.kind === k);
    const details = review.items.filter((s) => !["interaction", "commitment"].includes(s.kind));
    return (
      <div className="grid gap-4" aria-busy={pending}>
        <div className="grid gap-1 rounded-md bg-sunk p-3.5">
          {review.summary ? <p>{review.summary}</p> : null}
          <p className="hint">{review.items.length ? `${review.items.length} suggestions are ready.` : "Nothing new to add."}</p>
        </div>
        {of("interaction").length ? (
          <section className="sec" aria-label="Key moments">
            <h3>Key moments</h3>
            <ul className="grid gap-1.5 text-[14.5px]">
              {of("interaction").map((s) => (
                <li key={s.id}>
                  <span className="font-mono text-[12px] text-muted">{s.title.replace(/^Touch on /, "")}</span> {s.value}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {of("commitment").length ? (
          <section className="sec" aria-label="Promises">
            <h3>Promises</h3>
            <ul className="grid gap-1.5 text-[14.5px]">
              {of("commitment").map((s) => (
                <li key={s.id}>
                  <b>{s.title === "A promise you made" ? "You owe:" : "They owe:"}</b> {s.value}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {details.length ? (
          <section className="sec" aria-label="Details to add">
            <h3>Details to add</h3>
            <ul className="grid gap-1.5 text-[14.5px]">
              {details.map((s) => (
                <li key={s.id}>
                  <b>{s.title}:</b> {s.value}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={pending} onClick={save}>
            {pending ? "Saving…" : `Save to ${review.person.name}`}
          </Button>
          <Button variant="ghost" onClick={reset}>
            Start over
          </Button>
        </div>
      </div>
    );
  }
  return null;
}
