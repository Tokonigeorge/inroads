"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { goalPriorities, goalPriorityLabels, goalTypeLabels, goalTypes, goalTypesFor, type GoalType } from "@/contracts/goals";
import type { SpaceKind, Stage } from "@/contracts/spaces";
import type { FormState } from "@/features/forms";
import { fromDrafts, StagesEditor, toDrafts, type StageDraft } from "@/features/spaces/stages-editor";
import { Button } from "@/ui/button";
import { Field, Input, Segmented, Select } from "@/ui/field";
import { saveGoalAction } from "./actions";

export type GoalFormSpace = { id: string; name: string; kind: SpaceKind; stages: Stage[] };
export type GoalFormValues = {
  id: string;
  text: string;
  spaceId: string;
  type: GoalType;
  priority: number;
  weeklyTarget: number;
  dueOn: string | null;
  stages: Stage[] | null;
  hasPeople: boolean;
};

export function GoalForm({ spaces, goal, defaultSpaceId }: { spaces: GoalFormSpace[]; goal?: GoalFormValues; defaultSpaceId?: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>({});
  const [text, setText] = useState(goal?.text ?? "");
  const [spaceId, setSpaceId] = useState(goal?.spaceId ?? defaultSpaceId ?? spaces[0]?.id ?? "");
  const space = spaces.find((s) => s.id === spaceId) ?? spaces[0];
  const [type, setType] = useState<GoalType>(goal?.type ?? goalTypesFor[space?.kind ?? "work"][0]);
  const [priority, setPriority] = useState(String(goal?.priority ?? 2));
  const [weeklyTarget, setWeeklyTarget] = useState(String(goal?.weeklyTarget ?? 3));
  const [dueOn, setDueOn] = useState(goal?.dueOn ?? "");
  const [custom, setCustom] = useState(Boolean(goal?.stages));
  const [stages, setStages] = useState<StageDraft[]>(() => toDrafts(goal?.stages ?? space?.stages ?? []));
  const errors = state.fieldErrors ?? {};

  const suggested = goalTypesFor[space?.kind ?? "work"];
  const typeOptions = [...suggested, ...goalTypes.filter((x) => !suggested.includes(x))];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveGoalAction(goal?.id ?? null, {
        text,
        spaceId,
        type,
        priority: Number(priority),
        weeklyTarget: Number(weeklyTarget),
        dueOn: dueOn || null,
        stages: custom ? fromDrafts(stages) : null,
      });
      setState(r);
      if (r.ok && r.id) {
        router.push(`/goals/${r.id}`);
      }
    });
  };

  return (
    <form onSubmit={submit} className="grid max-w-[560px] gap-6" noValidate>
      <Field label="Goal" hint="Something you can finish, e.g. Raise a pre-seed round by March." error={errors.text}>
        {({ id, describedBy, invalid }) => (
          <Input id={id} value={text} onChange={(e) => setText(e.target.value)} maxLength={140} autoComplete="off" required aria-describedby={describedBy} aria-invalid={invalid} />
        )}
      </Field>

      {spaces.length > 1 ? (
        <Field label="Space" hint={goal?.hasPeople ? "Goals with people on them stay in their Space." : "Only people in this Space can be added to the goal."} error={errors.spaceId}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              value={spaceId}
              disabled={goal?.hasPeople}
              onChange={(e) => {
                setSpaceId(e.target.value);
                const next = spaces.find((s) => s.id === e.target.value);
                if (next && !custom) setStages(toDrafts(next.stages));
              }}
              aria-describedby={describedBy}
              aria-invalid={invalid}
            >
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}

      <Field label="Kind of goal" error={errors.type}>
        {({ id, describedBy }) => (
          <Select id={id} value={type} onChange={(e) => setType(e.target.value as GoalType)} aria-describedby={describedBy}>
            {typeOptions.map((x) => (
              <option key={x} value={x}>
                {goalTypeLabels[x]}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Segmented
        legend="Priority"
        name="priority"
        value={priority}
        onChange={setPriority}
        options={goalPriorities.map((p) => ({ value: String(p), label: goalPriorityLabels[p] }))}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Touches a week" hint="Touches with people on this goal, plus rooms you go to." error={errors.weeklyTarget}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="number" inputMode="numeric" min={1} max={50} value={weeklyTarget} onChange={(e) => setWeeklyTarget(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />
          )}
        </Field>
        <Field label="Finish by (optional)" error={errors.dueOn}>
          {({ id, describedBy, invalid }) => <Input id={id} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
        </Field>
      </div>

      <fieldset className="grid gap-2">
        <legend className="pb-1 text-small font-[550]">Pipeline</legend>
        <label className="flex cursor-pointer gap-3 rounded-md border border-border px-3 py-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
          <input
            type="radio"
            name="stagesMode"
            checked={!custom}
            onChange={() => {
              setCustom(false);
              setStages(toDrafts(space?.stages ?? []));
            }}
            className="mt-1 accent-[var(--accent)]"
          />
          <span className="grid">
            <span className="font-[550]">Use {space?.name ?? "the Space"}&apos;s stages</span>
            <span className="text-small text-muted">{(space?.stages ?? []).map((s) => s.label).join(" → ")}</span>
          </span>
        </label>
        <label className="flex cursor-pointer gap-3 rounded-md border border-border px-3 py-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
          <input type="radio" name="stagesMode" checked={custom} onChange={() => setCustom(true)} className="mt-1 accent-[var(--accent)]" />
          <span className="grid">
            <span className="font-[550]">Its own stages</span>
            <span className="text-small text-muted">For a goal that moves differently, like hiring.</span>
          </span>
        </label>
      </fieldset>
      {custom ? (
        <StagesEditor stages={stages} setStages={setStages} error={errors.stages} legend="Stages for this goal" hint="In order. Mark the ones that end the journey, like Won or Closed." />
      ) : errors.stages ? (
        <p role="alert" className="text-small text-danger">
          {errors.stages}
        </p>
      ) : null}

      {state.message ? (
        <p role="alert" className="text-small text-danger">
          {state.message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : goal ? "Save changes" : "Add goal"}
        </Button>
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
