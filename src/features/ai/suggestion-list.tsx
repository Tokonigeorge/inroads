"use client";

import { useState, useTransition } from "react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { acceptSuggestionAction, discardSuggestionAction } from "./actions";

export type SuggestionView = { id: string; kind: string; title: string; value: string; editable: boolean; why: string; sources: { title: string; url: string }[]; /** What's saved now, when this would replace it. */ was?: string };

/** AI suggestions waiting for a decision: Accept, Edit or Discard. Nothing changes until then. */
export function SuggestionList({ items }: { items: SuggestionView[] }) {
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const visible = items.filter((i) => !gone.has(i.id));
  if (!visible.length) return null;
  return (
    <ul className="grid gap-2" aria-label="Suggestions">
      {visible.map((s) => (
        <SuggestionCard key={s.id} s={s} onDone={() => setGone((g) => new Set(g).add(s.id))} />
      ))}
    </ul>
  );
}

function SuggestionCard({ s, onDone }: { s: SuggestionView; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(s.value);
  const [pending, start] = useTransition();
  const toast = useToast();
  const accept = (edited?: string) =>
    start(async () => {
      const r = await acceptSuggestionAction(s.id, edited);
      if (!r.ok) return toast.show(r.message ?? "Couldn't apply that.");
      onDone();
      toast.show("Saved.");
    });
  return (
    <li>
      <article aria-label={s.title} className="grid gap-2 rounded-md border border-border bg-surface p-3">
        <p className="text-small font-[550]">{s.title}</p>
        {editing ? (
          <Input aria-label={`Edit: ${s.title}`} value={value} onChange={(e) => setValue(e.target.value)} />
        ) : (
          <p className="whitespace-pre-line">{s.value}</p>
        )}
        <p className="text-small text-muted">
          {s.why}
          {s.sources.length ? (
            <>
              {" · "}
              {s.sources.slice(0, 2).map((src, i) => (
                <a key={src.url} href={src.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {i ? ", " : ""}
                  {src.title || new URL(src.url).hostname}
                </a>
              ))}
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={() => accept(editing ? value : undefined)}>
            {editing ? "Save" : "Accept"}
          </Button>
          {s.editable && !editing ? (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await discardSuggestionAction(s.id);
                onDone();
              })
            }
          >
            Discard
          </Button>
        </div>
      </article>
    </li>
  );
}

/** "Add these 3 to their profile" (prototype save-found, L1066): accept every missing detail at once. */
export function AcceptAllButton({ ids }: { ids: string[] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  if (!ids.length) return null;
  return (
    <Button
      variant="primary"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          let saved = 0;
          for (const id of ids) if ((await acceptSuggestionAction(id)).ok) saved++;
          toast.show(saved === 1 ? "Added 1 detail to their profile." : `Added ${saved} details to their profile.`);
        })
      }
    >
      {pending ? "Adding…" : ids.length === 1 ? "Add it to their profile" : `Add these ${ids.length} to their profile`}
    </Button>
  );
}

/**
 * On a person's page: what research (or a chat import) found, as one tick-box list. Everything
 * is ticked; untick what's wrong and apply the rest in one go. Nothing changes until you apply.
 */
export function SuggestionChecklist({ items }: { items: SuggestionView[] }) {
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const [off, setOff] = useState<Set<string>>(() => new Set());
  const [pending, start] = useTransition();
  const toast = useToast();
  const visible = items.filter((i) => !gone.has(i.id));
  if (!visible.length) return null;
  const picked = visible.filter((i) => !off.has(i.id));
  const drop = (ids: string[]) => setGone((g) => new Set([...g, ...ids]));
  return (
    <div className="grid gap-2">
      <ul className="grid gap-1" aria-label="Suggestions">
        {visible.map((s) => (
          <li key={s.id}>
            <label className="flex items-start gap-2.5 text-[14.5px]" title={s.why}>
              <input
                type="checkbox"
                checked={!off.has(s.id)}
                onChange={(e) =>
                  setOff((o) => {
                    const next = new Set(o);
                    if (e.target.checked) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  })
                }
                className="mt-1 accent-[var(--accent)]"
              />
              <span className="min-w-0">
                <span className="font-[550]">{s.title}:</span> <span className="whitespace-pre-line">{s.value}</span>
                {s.was ? <span className="text-muted"> (was {s.was})</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={pending || !picked.length}
          onClick={() =>
            start(async () => {
              let saved = 0;
              for (const s of picked) if ((await acceptSuggestionAction(s.id)).ok) saved++;
              drop(picked.map((s) => s.id));
              toast.show(saved === 1 ? "Updated 1 detail." : `Updated ${saved} details.`);
            })
          }
        >
          {picked.length === visible.length ? (visible.length === 1 ? "Apply" : "Apply all") : `Apply ${picked.length}`}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              for (const s of visible) await discardSuggestionAction(s.id);
              drop(visible.map((s) => s.id));
            })
          }
        >
          Dismiss all
        </Button>
      </div>
    </div>
  );
}
