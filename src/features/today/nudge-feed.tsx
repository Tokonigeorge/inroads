"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Nudge, NudgeAction } from "@/domain/nudges";
import { sendCapture } from "@/features/offline/outbox";
import { useCapture } from "@/features/shell/capture-sheet";
import { Button } from "@/ui/button";
import { Avatar } from "@/ui/list-row";
import { useToast } from "@/ui/toast";
import { dismissNudgeAction, snoozeNudgeAction, undoNudgeAction } from "./actions";

type Props = { nudges: Nudge[]; spaces: Record<string, { id: string; name: string }[]> };

/** Today's reminders. Every action hides the card at once; snooze, done and dismiss can be undone. */
export function NudgeFeed({ nudges, spaces }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [, start] = useTransition();
  const router = useRouter();
  const capture = useCapture();
  const toast = useToast();
  const visible = nudges.filter((n) => !hidden.has(n.key));
  const hide = (key: string) => setHidden((s) => new Set(s).add(key));
  const show = (key: string) =>
    setHidden((s) => {
      const next = new Set(s);
      next.delete(key);
      return next;
    });

  const run = (n: Nudge, a: NudgeAction) => {
    switch (a.type) {
      case "open_person":
        return router.push(`/people/${a.personId}`);
      case "edit_person":
        return router.push(`/people/${a.personId}/edit`);
      case "open_room":
        return router.push(`/rooms/${a.eventId}`);
      case "sort":
        return router.push("/people/triage");
      case "review_duplicates":
        return router.push("/people/duplicates");
      case "review_suggestions":
        return router.push("/people/suggestions");
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
    return <p className="text-muted">Nothing needs you right now. Follow-ups, birthdays and promises show up here.</p>;
  }

  return (
    <ul className="grid gap-3" aria-label="Follow up">
      {visible.map((n) => (
        <li key={n.key}>
          <article aria-labelledby={`n-${n.key}`} className="grid gap-3 rounded-md border border-border bg-surface p-4">
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
              {n.actions.map((a, i) => (
                <Button key={`${a.type}-${i}`} size="sm" variant={i === 0 ? "secondary" : "ghost"} onClick={() => run(n, a)}>
                  {a.label}
                </Button>
              ))}
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
