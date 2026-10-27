"use client";

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

/** Kind colours (prototype .k-*, L168): cold cool, birthday fresh, promise warn, context faint, research accent, event good. */
const kindColour: Record<Nudge["kind"], string> = {
  due: "var(--cool)",
  birthday: "var(--fresh)",
  promise: "var(--warn)",
  owed_to_me: "var(--warn)",
  context: "var(--faint)",
  prep: "var(--accent)",
  room: "var(--good)",
  after_room: "var(--good)",
  triage: "var(--faint)",
  duplicates: "var(--faint)",
  suggestions: "var(--accent)",
  moved: "var(--hot)",
};

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
      case "decode_room":
        return start(async () => {
          const r = await startAiJobAction({ kind: "lookup", spaceId: a.spaceId, type: "event", q: a.title, eventId: a.eventId });
          if (!r.jobId) return toast.show(r.message ?? "Couldn't start decoding the room.");
          toast.show(`Decoding ${a.title}. The plan will be on the room in a minute.`);
          router.push(`/rooms/${a.eventId}`);
        });
      case "debrief_room":
        return router.push(`/rooms/${a.eventId}/after?on=${a.occurrenceOn}`);
      case "sort":
        return router.push("/sort");
      case "review_duplicates":
        return router.push("/duplicates");
      case "review_suggestions":
        return router.push("/suggestions");
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
      <p className="rounded-md border border-dashed border-line bg-sunk p-3.5 text-[14.5px] text-muted">
        Nothing needs you right now. As your network grows, follow-ups, birthdays and promises show up here.
      </p>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3" aria-label="Nudges">
        {visible.map((n, i) => (
          <li key={n.key} className={leaving.has(n.key) ? "leaving" : "rise"} style={{ ["--i" as string]: i }}>
            <article aria-labelledby={`n-${n.key}`} className="card grid h-full content-start gap-3 p-3.5" style={{ ["--nk" as string]: kindColour[n.kind] }}>
              <p className="inline-flex items-center gap-[7px] font-mono text-[11px] leading-none tracking-[0.08em] text-muted uppercase">
                <i aria-hidden className="size-2 rounded-[2px] bg-[var(--nk)]" />
                {n.label}
              </p>
              <div className={n.person ? "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5" : "grid"}>
                {n.person ? <Avatar name={n.person.name} size={42} warmth={n.kind === "due" ? "cooling" : undefined} /> : null}
                <div>
                  <h3 id={`n-${n.key}`}>{n.title}</h3>
                  <p className="mt-[3px] text-[14px] text-muted">{n.body}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {n.actions
                  .filter((a) => aiEnabled || (a.type !== "draft" && a.type !== "research" && a.type !== "decode_room"))
                  .map((a, i) => (
                    <Button
                      key={`${a.type}-${i}`}
                      size="sm"
                      variant={i === 0 ? "primary" : a.type === "snooze" || a.type === "dismiss" ? "ghost" : "secondary"}
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
