"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Stage } from "@/contracts/spaces";
import { warmth } from "@/domain/relationship";
import { Select } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { WarmthDot } from "@/ui/warmth";
import { moveStageAction, removeFromGoalAction, restoreLinkAction } from "./actions";

export type PipelineCard = { linkId: string; personId: string; name: string; detail: string; stage: string; note: string | null; lastTouchedOn: string | null };

/**
 * The goal's pipeline: a column per stage on desktop, stacked stages on a phone. Each person
 * has a stage picker; on desktop `[` and `]` move the focused person back or forward. Drag and
 * drop is deferred (TECH_PLAN §7.2).
 */
export function Pipeline({ stages, cards, today }: { stages: Stage[]; cards: PipelineCard[]; today: string }) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [, start] = useTransition();
  const toast = useToast();
  const focusNext = useRef<string | null>(null);
  const nodes = useRef(new Map<string, HTMLElement>());

  const stageOf = (c: PipelineCard) => overrides[c.linkId] ?? c.stage;
  const visible = cards.filter((c) => !removed.has(c.linkId));

  useEffect(() => {
    if (!focusNext.current) return;
    nodes.current.get(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const move = (c: PipelineCard, stage: string, keepFocus = false) => {
    const before = stageOf(c);
    if (stage === before) return;
    setOverrides((o) => ({ ...o, [c.linkId]: stage }));
    if (keepFocus) focusNext.current = c.linkId;
    start(async () => {
      const r = await moveStageAction(c.linkId, stage);
      if (r.message) {
        setOverrides((o) => ({ ...o, [c.linkId]: before }));
        toast.show(r.message);
      }
    });
  };

  const remove = (c: PipelineCard) => {
    setRemoved((s) => new Set(s).add(c.linkId));
    start(async () => {
      const link = await removeFromGoalAction(c.linkId);
      if (!link) return;
      toast.show(`${c.name} removed from this goal.`, {
        label: "Undo",
        onClick: () =>
          start(async () => {
            await restoreLinkAction(link);
          }),
      });
    });
  };

  const onKey = (e: React.KeyboardEvent, c: PipelineCard) => {
    if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== "[" && e.key !== "]") return;
    const i = stages.findIndex((s) => s.key === stageOf(c));
    const next = stages[i + (e.key === "]" ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    move(c, next.key, true);
  };

  if (!visible.length) {
    return <p className="text-muted">No one on this goal yet. Add the people who could help, starting with anyone you&apos;ve already met.</p>;
  }

  return (
    <div className="grid gap-6 md:flex md:items-start md:gap-3 md:overflow-x-auto md:pb-2">
      {stages.map((s) => {
        const here = visible.filter((c) => stageOf(c) === s.key);
        return (
          <section key={s.key} aria-labelledby={`stage-${s.key}`} className={`md:w-64 md:shrink-0 ${here.length ? "" : "hidden md:block"}`}>
            <h3 id={`stage-${s.key}`} className="flex items-baseline justify-between pb-2 text-small font-semibold">
              {s.label}
              <span className="font-normal text-muted tabular">{here.length}</span>
            </h3>
            <ul className="grid gap-2 md:min-h-16 md:rounded-md md:bg-sunken/60 md:p-2">
              {here.map((c) => {
                const w = warmth(c.lastTouchedOn, today);
                return (
                  <li key={c.linkId}>
                    <article
                      ref={(el) => {
                        if (el) nodes.current.set(c.linkId, el);
                        else nodes.current.delete(c.linkId);
                      }}
                      tabIndex={0}
                      onKeyDown={(e) => onKey(e, c)}
                      aria-label={`${c.name}, ${s.label}`}
                      className="grid gap-2 rounded-md border border-border bg-surface p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/people/${c.personId}`} className="block truncate font-[550] hover:underline">
                            {c.name}
                          </Link>
                          {c.detail ? <p className="truncate text-small text-muted">{c.detail}</p> : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(c)}
                          aria-label={`Remove ${c.name} from this goal`}
                          className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-text"
                        >
                          <X size={14} aria-hidden />
                        </button>
                      </div>
                      <p className="flex items-center gap-1.5 text-small text-muted">
                        <WarmthDot warmth={w} />
                        {c.lastTouchedOn ? `Last spoke ${w.label.toLowerCase()}` : "No touches yet"}
                      </p>
                      {c.note ? <p className="text-small">{c.note}</p> : null}
                      <Select aria-label={`Stage for ${c.name}`} value={stageOf(c)} onChange={(e) => move(c, e.target.value)} className="h-9 text-small md:text-small">
                        {stages.map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </article>
                  </li>
                );
              })}
              {!here.length ? <li className="px-1 py-2 text-small text-muted">No one here</li> : null}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
