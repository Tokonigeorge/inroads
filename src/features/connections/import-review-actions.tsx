"use client";

import { useState, useTransition } from "react";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/field";
import { cancelImportAction, commitImportAction } from "./import-actions";

type Contacts = { found: number; add: number; fill: number; unchanged: number; nameless: number };
const n = (x: number) => x.toLocaleString("en-GB");

function Check({ checked, onChange, title, sub }: { checked: boolean; onChange: (v: boolean) => void; title: string; sub?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line bg-surface p-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-[18px] shrink-0 accent-[var(--accent)]" />
      <span className="grid gap-0.5">
        <b className="text-[14.5px]">{title}</b>
        {sub ? <span className="text-[13.5px] text-muted">{sub}</span> : null}
      </span>
    </label>
  );
}

/** The review's choices (prototype L2305–2326): contacts, each calendar, and who you are in them. */
export function ImportReviewActions({
  importId,
  spaces,
  defaultSpaceId,
  contacts,
  calendars,
  myEmails,
}: {
  importId: string;
  spaces: { id: string; name: string }[];
  defaultSpaceId: string;
  contacts: Contacts | null;
  calendars: { name: string; events: number }[];
  myEmails: string;
}) {
  const [spaceId, setSpaceId] = useState(defaultSpaceId);
  const [withContacts, setWithContacts] = useState(true);
  const [skipNameless, setSkipNameless] = useState(true);
  const [chosen, setChosen] = useState(() => new Set(calendars.filter((c) => !/holiday|birthday/i.test(c.name)).map((c) => c.name)));
  const [includeSolo, setIncludeSolo] = useState(false);
  const [me, setMe] = useState(myEmails);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4">
      {contacts ? (
        <section className="sec" aria-label="Contacts">
          <h3>Contacts</h3>
          <Check
            checked={withContacts}
            onChange={setWithContacts}
            title={`Import ${n(contacts.found)} contacts`}
            sub={[`${n(contacts.add)} new`, contacts.fill ? `${n(contacts.fill)} existing people get missing details` : null, contacts.unchanged ? `${n(contacts.unchanged)} already up to date` : null].filter(Boolean).join(" · ")}
          />
          {withContacts && contacts.nameless ? (
            <Check checked={skipNameless} onChange={setSkipNameless} title={`Skip ${n(contacts.nameless)} ${contacts.nameless === 1 ? "entry" : "entries"} with no name`} sub="Just an email address or a number, often saved automatically by Gmail." />
          ) : null}
          <p className="hint">Labels become tags; starred contacts become priority.</p>
        </section>
      ) : null}
      {calendars.length ? (
        <section className="sec" aria-label="Calendars">
          <h3>Calendars</h3>
          {calendars.map((c) => (
            <Check
              key={c.name}
              checked={chosen.has(c.name)}
              onChange={(v) =>
                setChosen((s) => {
                  const next = new Set(s);
                  if (v) next.add(c.name);
                  else next.delete(c.name);
                  return next;
                })
              }
              title={c.name}
              sub={`${n(c.events)} ${c.events === 1 ? "event" : "events"}`}
            />
          ))}
          <Check checked={includeSolo} onChange={setIncludeSolo} title="Also add upcoming events with no other guests" sub="Personal blocks, reminders and recurring commitments you keep alone." />
          <Field label="Your email address in these calendars" hint="Keeps you out of the guest lists. Separate several with commas.">
            {({ id, describedBy }) => <Input id={id} value={me} onChange={(e) => setMe(e.target.value)} placeholder="you@gmail.com" autoComplete="off" aria-describedby={describedBy} />}
          </Field>
          <p className="hint">Meetings from the last 6 months are logged on the people in them; the next 3 months go into your events.</p>
        </section>
      ) : null}
      {spaces.length > 1 ? (
        <Field label="Put new people in" hint="People you already have stay in their Spaces.">
          {({ id, describedBy }) => (
            <Select id={id} aria-describedby={describedBy} value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className="max-w-[320px]">
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      {message ? (
        <p role="alert" className="text-small text-danger">
          {message}
        </p>
      ) : null}
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-bg px-4 py-3">
        <Button variant="ghost" disabled={pending} onClick={() => start(() => cancelImportAction(importId))}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await commitImportAction(importId, spaceId, {
                contacts: Boolean(contacts) && withContacts,
                skipNameless,
                calendars: calendars.length ? [...chosen] : null,
                includeSolo,
                meEmails: me,
              });
              if (r?.message) setMessage(r.message);
            })
          }
        >
          {pending ? "Importing…" : "Import"}
        </Button>
      </div>
    </div>
  );
}
