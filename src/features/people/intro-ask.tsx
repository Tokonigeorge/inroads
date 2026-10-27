"use client";

import { useRouter } from "next/navigation";
import { strengthLabel } from "@/domain/relationship";
import { useState, useTransition } from "react";
import { introAsk } from "@/domain/intro";
import { whatsappDigits } from "@/domain/normalise";
import { Button } from "@/ui/button";
import { Field, Select, Textarea } from "@/ui/field";
import { Sheet } from "@/ui/sheet";
import { useToast } from "@/ui/toast";
import { requestIntroAction } from "./actions";
import { PersonPicker } from "./person-picker";

export type IntroSpace = {
  id: string;
  name: string;
  goals: { id: string; text: string }[];
  paths: { personId: string; name: string; detail: string; reasons: string[]; phone: string | null; email: string | null; strength: number | null }[];
};
type Connector = { id: string; name: string; phone: string | null; email: string | null };

/** "Ask for an intro": pick who could introduce you, send a consent-first ask, track it. */
export function IntroAsk({ target, targetDetail, spaces }: { target: { id: string; name: string }; targetDetail: string; spaces: IntroSpace[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const space = spaces.find((s) => s.id === spaceId) ?? spaces[0];
  const [connector, setConnector] = useState<Connector | null>(null);
  const [picking, setPicking] = useState(false);
  const [goalId, setGoalId] = useState("");
  const [edited, setEdited] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!space) return null;
  const first = target.name.split(/\s+/)[0];
  const goal = space.goals.find((g) => g.id === goalId)?.text ?? null;
  const message = edited ?? (connector ? introAsk({ connector: connector.name, target: target.name, targetDetail, goal }) : "");
  const choose = (c: Connector | null) => {
    setConnector(c);
    setEdited(null);
    setPicking(false);
  };

  function save() {
    if (!connector) return setError(`Choose who could introduce you to ${first}.`);
    setError(null);
    start(async () => {
      const r = await requestIntroAction({ targetId: target.id, connectorId: connector.id, spaceId: space.id, goalId: goalId || null, dueInDays: 7 });
      if (!r.ok) return setError(r.message ?? "That couldn't be saved.");
      toast.show(`Saved. ${connector.name.split(/\s+/)[0]} owes you the intro to ${first}; it shows on Today if it's late.`);
      setOpen(false);
      choose(null);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Ask for an intro
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={`Ask for an intro to ${first}`} description="Ask someone you know whether they'd introduce you. Nothing is sent from Inroads.">
        <div className="grid gap-5">
          {spaces.length > 1 ? (
            <Field label="Space">
              {({ id }) => (
                <Select id={id} value={space.id} onChange={(e) => (setSpaceId(e.target.value), choose(null), setGoalId(""))}>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}

          <fieldset className="grid gap-2">
            <legend className="pb-1.5 font-semibold">Who could introduce you</legend>
            {space.paths.length ? (
              space.paths.map((p) => (
                <label key={p.personId} className="flex min-h-11 items-start gap-3 rounded-md px-2 py-2 hover:bg-sunken">
                  <input type="radio" name="intro-connector" className="mt-1" checked={connector?.id === p.personId} onChange={() => choose({ id: p.personId, name: p.name, phone: p.phone, email: p.email })} />
                  <span className="grid">
                    <span className="font-[550]">
                      {p.name}
                      {p.detail ? <span className="font-normal text-muted"> · {p.detail}</span> : null}
                    </span>
                    <span className="text-small text-muted">
                      {[p.strength != null ? `You and ${p.name.split(/\s+/)[0]}: ${strengthLabel(p.strength).toLowerCase()} (${p.strength}/100)` : "You haven't been in touch yet", ...p.reasons].join(" · ")}
                    </span>
                  </span>
                </label>
              ))
            ) : (
              <p className="text-small text-muted">No warm paths found in {space.name} yet. Choose anyone you know there.</p>
            )}
            {connector && !space.paths.some((p) => p.personId === connector.id) ? <p className="px-2 text-small">Asking {connector.name}</p> : null}
            {picking ? (
              <div className="rounded-md bg-sunken p-3">
                <PersonPicker spaceId={space.id} onPick={(p) => (p.id === target.id ? setError(`Choose someone other than ${first}.`) : choose({ id: p.id, name: p.name, phone: null, email: null }))} />
              </div>
            ) : (
              <div>
                <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
                  Someone else
                </Button>
              </div>
            )}
          </fieldset>

          {space.goals.length ? (
            <Field label="For a goal" hint="Optional. Moves them to “Warm path found” on that goal.">
              {({ id, describedBy }) => (
                <Select id={id} value={goalId} onChange={(e) => (setGoalId(e.target.value), setEdited(null))} aria-describedby={describedBy}>
                  <option value="">No goal</option>
                  {space.goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.text}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}

          {connector ? (
            <div className="grid gap-3">
              <Field label={`Message to ${connector.name.split(/\s+/)[0]}`}>
                {({ id }) => <Textarea id={id} rows={5} value={message} onChange={(e) => setEdited(e.target.value)} />}
              </Field>
              <div className="flex flex-wrap gap-2">
                {connector.phone ? (
                  <Button asChild size="sm">
                    <a href={`https://wa.me/${whatsappDigits(connector.phone)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                      Open in WhatsApp
                    </a>
                  </Button>
                ) : null}
                {connector.email ? (
                  <Button asChild size="sm">
                    <a href={`mailto:${connector.email}?subject=${encodeURIComponent(`Intro to ${target.name}?`)}&body=${encodeURIComponent(message)}`}>Email</a>
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(message).then(() => toast.show("Copied."))}>
                  Copy
                </Button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          ) : null}
          <div>
            <Button variant="primary" onClick={save} disabled={pending || !connector}>
              {pending ? "Saving…" : "I've asked"}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
