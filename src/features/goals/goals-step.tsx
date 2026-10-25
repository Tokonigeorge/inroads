"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { GoalType } from "@/contracts/goals";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { saveOnboardingGoalsAction } from "./actions";

const picks: { label: string; text: string; type: GoalType }[] = [
  { label: "Raise capital", text: "Raise a funding round", type: "capital" },
  { label: "Win new clients", text: "Win new clients", type: "clients" },
  { label: "Hire great people", text: "Hire great people", type: "hiring" },
  { label: "Find partners", text: "Find partners to grow with", type: "partners" },
  { label: "Find a mentor", text: "Find a mentor", type: "mentors" },
  { label: "Grow my career", text: "Land my next role", type: "career" },
  { label: "Enter a new market", text: "Break into a new market", type: "market" },
];

/** Set-up step: pick what you're working towards (or write it), so every suggestion has a point. */
export function GoalsStep({ next }: { next: string }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const [own, setOwn] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (label: string) =>
    setChosen((s) => {
      const n = new Set(s);
      if (n.has(label)) n.delete(label);
      else n.add(label);
      return n;
    });
  const goals = [...(own.trim() ? [{ text: own.trim(), type: "other" as const }] : []), ...picks.filter((p) => chosen.has(p.label)).map((p) => ({ text: p.text, type: p.type }))];

  return (
    <div className="grid max-w-[640px] gap-6">
      <fieldset>
        <legend className="pb-2 text-small font-[550]">Pick any that fit</legend>
        <div className="flex flex-wrap gap-2">
          {picks.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={chosen.has(p.label)}
              onClick={() => toggle(p.label)}
              className="rounded-md border border-border px-3 py-2 text-small font-[550] text-muted aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent"
            >
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-1.5">
        <span className="text-small font-[550]">Or in your own words</span>
        <Input value={own} onChange={(e) => setOwn(e.target.value)} maxLength={140} placeholder="e.g. Meet three seed investors before March" autoComplete="off" />
      </label>
      {message ? (
        <p role="alert" className="text-small text-danger">
          {message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="primary"
          disabled={pending || !goals.length}
          onClick={() =>
            start(async () => {
              const r = await saveOnboardingGoalsAction(goals);
              if (!r.ok) return setMessage(r.message ?? "Those didn't save.");
              router.push(next);
            })
          }
        >
          {goals.length > 1 ? `Save ${goals.length} goals` : "Save and continue"}
        </Button>
        <Link href={next} className="text-small text-muted hover:text-text">
          Skip for now
        </Link>
      </div>
    </div>
  );
}
