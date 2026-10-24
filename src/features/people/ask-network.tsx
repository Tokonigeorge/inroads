"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/ui/button";
import { Field, Select, Textarea } from "@/ui/field";
import { askNetworkAction, type AskState } from "./actions";

const EXAMPLES = ["Who do I know in fintech in Accra who's raised before?", "Who could help me hire a designer?", "Who did I meet at Lagos Startup Week?"];

/** Ask a question about your own people, in one Space. */
export function AskNetwork({ spaces, defaultSpaceId, aiEnabled }: { spaces: { id: string; name: string }[]; defaultSpaceId: string; aiEnabled: boolean }) {
  const [state, action, pending] = useActionState<AskState, FormData>(askNetworkAction, {});
  const errors = state.fieldErrors ?? {};
  const r = state.result;
  return (
    <div className="grid gap-8">
      <form action={action} className="grid max-w-[640px] gap-4" noValidate>
        <Field label="Your question" hint={`For example: “${EXAMPLES[0]}”`} error={errors.question}>
          {({ id, describedBy, invalid }) => <Textarea id={id} name="question" rows={2} maxLength={300} defaultValue={state.question ?? ""} aria-describedby={describedBy} aria-invalid={invalid} />}
        </Field>
        {spaces.length > 1 ? (
          <Field label="Space" hint="Inroads only looks in one Space at a time." error={errors.spaceId}>
            {({ id, describedBy }) => (
              <Select id={id} name="spaceId" defaultValue={defaultSpaceId} aria-describedby={describedBy}>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <input type="hidden" name="spaceId" value={defaultSpaceId} />
        )}
        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Looking…" : "Ask"}
          </Button>
        </div>
        {!aiEnabled ? <p className="text-small text-muted">AI isn&apos;t set up on this server, so Inroads matches the words in your question.</p> : null}
      </form>

      {r ? (
        <section aria-labelledby="ask-results" aria-live="polite" className="grid max-w-[640px] gap-3">
          <h2 id="ask-results" className="text-title font-semibold">
            {r.matches.length ? (r.matches.length === 1 ? "1 person" : `${r.matches.length} people`) : "No one yet"}
          </h2>
          {r.matches.length ? (
            <ul className="grid gap-3">
              {r.matches.map((m) => (
                <li key={m.id} className="grid gap-0.5 border-b border-border pb-3 last:border-b-0">
                  <Link href={`/people/${m.id}`} className="font-[550] hover:underline">
                    {m.name}
                  </Link>
                  {m.detail ? <p className="text-small text-muted">{m.detail}</p> : null}
                  <p className="text-small">{m.why}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Nothing you&apos;ve recorded matches {r.terms.length ? `“${r.terms.slice(0, 4).join("”, “")}”` : "that"}. Try other words, or add notes and interests to the people you know.</p>
          )}
          <p className="text-small text-muted">{r.source === "ai" ? "Ranked with AI from what you've recorded." : "Matched on the words in your question."} Only this Space was searched.</p>
        </section>
      ) : null}
    </div>
  );
}
