"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { Nudge, NudgeAction } from "@/domain/nudges";
import { startAiJobAction } from "@/features/ai/actions";
import { DraftSheet } from "@/features/ai/draft-sheet";
import { sendCapture } from "@/features/offline/outbox";
import { useCapture } from "@/features/shell/capture-sheet";
import { Button } from "@/ui/button";
import { Avatar } from "@/ui/list-row";
import { useToast } from "@/ui/toast";
import { dismissNudgeAction, snoozeNudgeAction, undoNudgeAction } from "./actions";

type Props = { nudges: Nudge[]; spaces: Record<string, { id: string; name: string }[]>; aiEnabled?: boolean };

/** Today's reminders. Every action hides the card at once; snooze, done and dismiss can be undone. */
export function NudgeFeed({ nudges, spaces, aiEnabled = false }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  // Cards on their way out slide away for a moment before they're removed.
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<{ personId: string; name: string; purpose: string } | null>(null);
  const [researching, setResearching] = useState<Set<string>>(() => new Set());
  const [, start] = useTransition();
  const router = useRouter();
  const capture = useCapture();
  const toast = useToast();
  const visible = nudges.filter((n) => !hidden.has(n.key));
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const hide = (key: string) => {
    setLeaving((s) => new Set(s).add(key));
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);
        setHidden((s) => new Set(s).add(key));
      }, 200),
    );
  };
  const show = (key: string) => {
    // An undo straight after can beat the slide-out: cancel it so the card doesn't vanish again.
    clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    const without = (s: Set<string>) => {
      const next = new Set(s);
      next.delete(key);
      return next;
    };
    setLeaving(without);
    setHidden(without);
  };

  const run = (n: Nudge, a: NudgeAction) => {
    switch (a.type) {
      case "open_person":
        return router.push(`/people/${a.personId}`);
      case "edit_person":
        return router.push(`/people/${a.personId}/edit`);
      case "open_room":
        return router.push(`/rooms/${a.eventId}`);
      case "debrief_room":
        return router.push(`/rooms/${a.eventId}/after?on=${a.occurrenceOn}`);
      case "sort":
        return router.push("/people/triage");
      case "review_duplicates":
        return router.push("/people/duplicates");
      case "review_suggestions":
        return router.push("/people/suggestions");
      case "draft":
        return setDraft({ personId: a.personId, name: n.person?.name ?? "", purpose: a.purpose });
      case "research":
        setResearching((s) => new Set(s).add(a.personId));
        return start(async () => {
          const r = await startAiJobAction({ kind: "research", personId: a.personId, spaceId: a.spaceId, mode: "research" });
          toast.show(
            r.jobId
              ? `Researching ${n.person?.name.split(/\s+/)[0] ?? "them"}. Talking points will be on their page and here in a minute.`
              : (r.message ?? "Couldn't start the research."),
          );
          if (!r.jobId)
            setResearching((s) => {
              const next = new Set(s);
              next.delete(a.personId);
              return next;
            });
        });
      case "log_touch":
        return capture.open({ mode: "touch", person: { id: a.personId, name: n.person?.name ?? "", spaces: spaces[a.personId] ?? [] } });
      case "promise_done":
        hide(n.key);
        return start(async () => {
          const r = await sendCapture({ kind: "promise_done", data: { id: a.commitmentId, done: true } });
          if (!r.ok) {
            show(n.key);
            return toast.show(r.message);
          }
          toast.show(r.queued ? "Saved on this device. It will sync when you're back online." : "Marked done.", {
            label: "Undo",
            onClick: () =>
              start(async () => {
                await sendCapture({ kind: "promise_done", data: { id: a.commitmentId, done: false } });
                show(n.key);
                router.refresh();
              }),
          });
          if (!r.queued) router.refresh();
        });
      case "snooze":
      case "dismiss":
        hide(n.key);
        return start(async () => {
          try {
            if (a.type === "snooze") await snoozeNudgeAction(n.key, a.days);
            else await dismissNudgeAction(n.key);
            toast.show(a.type === "snooze" ? `Snoozed for ${a.days} days.` : "Hidden.", {
              label: "Undo",
              onClick: () =>
                start(async () => {
                  await undoNudgeAction(n.key);
                  show(n.key);
                }),
            });
          } catch {
            show(n.key);
            toast.show("Couldn't do that. Check your connection and try again.");
          }
        });
    }
  };

  if (!visible.length) {
    return (
      <div className="rise flex items-center gap-3 rounded-lg border border-dashed border-border p-4">
        <span aria-hidden className="pop flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Check size={18} />
        </span>
        <p className="text-muted">All caught up. Follow-ups, birthdays and promises show up here when they&apos;re due.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="grid gap-3" aria-label="Follow up">
        {visible.map((n, i) => (
          <li key={n.key} className={leaving.has(n.key) ? "leaving" : "rise"} style={{ ["--i" as string]: i }}>
            <article aria-labelledby={`n-${n.key}`} className="grid gap-3 rounded-md border border-border bg-surface p-4 transition-colors hover:border-border-strong">
              <div className="flex items-start gap-3">
                {n.person ? <Avatar name={n.person.name} /> : null}
                <div className="grid min-w-0 gap-0.5">
                  <p className={`text-small font-[550] ${n.kind === "promise" && n.priority === 0 ? "text-danger" : "text-muted"}`}>{n.label}</p>
                  <h3 id={`n-${n.key}`} className="font-semibold">
                    {n.title}
                  </h3>
                  <p className="text-small text-muted">{n.body}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {n.actions
                  .filter((a) => aiEnabled || (a.type !== "draft" && a.type !== "research"))
                  .map((a, i) => (
                    <Button
                      key={`${a.type}-${i}`}
                      size="sm"
                      variant={i === 0 ? "secondary" : "ghost"}
                      disabled={a.type === "research" && researching.has(a.personId)}
                      onClick={() => run(n, a)}
                    >
                      {a.type === "research" && researching.has(a.personId) ? "Researching…" : a.label}
                    </Button>
                  ))}
              </div>
            </article>
          </li>
        ))}
      </ul>
      {draft ? (
        <DraftSheet
          key={`${draft.personId}:${draft.purpose}`}
          open
          onOpenChange={(o) => {
            if (!o) setDraft(null);
          }}
          personId={draft.personId}
          name={draft.name}
          spaces={spaces[draft.personId] ?? []}
          initialPurpose={draft.purpose}
        />
      ) : null}
    </>
  );
}
