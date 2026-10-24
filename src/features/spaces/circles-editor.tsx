"use client";

import { useState, useTransition } from "react";
import { cadenceChoices, cadenceLabel } from "@/contracts/spaces";
import { Button } from "@/ui/button";
import { Input, Select } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { deleteCircleAction, saveCircleAction } from "./actions";

type Circle = { id: string; name: string; defaultCadenceDays: number | null };

function CircleRow({ spaceId, circle, onDone }: { spaceId: string; circle?: Circle; onDone?: () => void }) {
  const [name, setName] = useState(circle?.name ?? "");
  const [cadence, setCadence] = useState(circle?.defaultCadenceDays ? String(circle.defaultCadenceDays) : "none");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const save = () =>
    start(async () => {
      const r = await saveCircleAction({ id: circle?.id, spaceId, name, defaultCadenceDays: cadence === "none" ? null : Number(cadence) });
      const msg = r.fieldErrors?.name ?? r.message;
      if (msg) return setError(msg);
      setError(null);
      toast.show(circle ? "Circle saved." : "Circle added.");
      if (!circle) setName("");
      onDone?.();
    });
  return (
    <li className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label={circle ? `Name of ${circle.name}` : "New circle name"} placeholder="e.g. Investors" maxLength={40} className="min-w-40 flex-1" />
        <Select value={cadence} onChange={(e) => setCadence(e.target.value)} aria-label="Reminder for this circle" className="w-auto">
          <option value="none">Space default</option>
          {cadenceChoices
            .filter((c) => c.days)
            .map((c) => (
              <option key={c.days} value={String(c.days)}>
                {c.label}
              </option>
            ))}
        </Select>
        <Button size="sm" onClick={save} disabled={pending || !name.trim()}>
          {circle ? "Save" : "Add circle"}
        </Button>
        {circle ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => (await deleteCircleAction(circle.id), toast.show("Circle deleted.")))}>
            Delete
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** Circles group people inside a Space and give them a shared reminder, e.g. "Investors: monthly". */
export function CirclesEditor({ spaceId, circles, spaceDefault }: { spaceId: string; circles: Circle[]; spaceDefault: number | null }) {
  return (
    <section className="grid max-w-[560px] gap-3 border-t border-border pt-6">
      <h2 className="text-title font-semibold">Circles</h2>
      <p className="text-small text-muted">
        Group people and give each group its own reminder. People without a circle use the Space default ({cadenceLabel(spaceDefault).toLowerCase()}).
      </p>
      <ul className="grid gap-3">
        {circles.map((c) => (
          <CircleRow key={`${c.id}-${c.name}-${c.defaultCadenceDays}`} spaceId={spaceId} circle={c} />
        ))}
        <CircleRow spaceId={spaceId} />
      </ul>
    </section>
  );
}
