"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Stage } from "@/contracts/spaces";
import type { PickedPerson } from "@/features/people/capture-forms";
import { PersonPicker } from "@/features/people/person-picker";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/field";
import { Sheet } from "@/ui/sheet";
import { useToast } from "@/ui/toast";
import { useShortcut } from "@/ui/use-shortcut";
import { addNewPersonToGoalAction, addPeopleToGoalAction, deleteGoalAction, setGoalStateAction } from "./actions";

type Props = { goalId: string; text: string; spaceId: string; spaceName: string; stages: Stage[]; active: boolean; archived: boolean };

const itemClass = "flex h-9 items-center rounded-md px-2.5 outline-none data-[highlighted]:bg-sunken";

export function GoalActions({ goalId, text, spaceId, spaceName, stages, active, archived }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  useShortcut("e", () => router.push(`/goals/${goalId}/edit`));
  useShortcut("a", () => setAdding(true), !archived);
  const setState = (state: { active?: boolean; archived?: boolean }, message: string) =>
    start(async () => {
      await setGoalStateAction(goalId, state);
      toast.show(message);
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!archived ? (
        <Button variant="primary" onClick={() => setAdding(true)}>
          Add people
        </Button>
      ) : null}
      <Button asChild variant="ghost">
        <Link href={`/goals/${goalId}/edit`}>Edit</Link>
      </Button>
      <Menu.Root>
        <Menu.Trigger className="flex size-10 items-center justify-center rounded-md text-muted hover:bg-sunken" aria-label="More actions">
          <MoreHorizontal size={18} aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="end" sideOffset={4} className="z-50 min-w-[200px] rounded-lg bg-surface p-1 shadow-pop">
            {!archived ? (
              <Menu.Item className={itemClass} onSelect={() => setState({ active: !active }, active ? "Goal paused. It won't count in your week." : "Goal resumed.")}>
                {active ? "Pause goal" : "Resume goal"}
              </Menu.Item>
            ) : null}
            <Menu.Item className={itemClass} onSelect={() => setState({ archived: !archived }, archived ? "Goal restored." : "Goal archived.")}>
              {archived ? "Restore goal" : "Archive goal"}
            </Menu.Item>
            <Menu.Item className={`${itemClass} text-danger`} onSelect={() => setConfirmDelete(true)}>
              Delete goal…
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      {confirmDelete ? (
        <div role="alertdialog" aria-label="Delete this goal?" className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-3">
          <p className="text-small">Delete &quot;{text}&quot;? Its pipeline goes too. People and rooms stay.</p>
          <Button size="sm" variant="danger" disabled={pending} onClick={() => start(() => deleteGoalAction(goalId))}>
            Delete goal
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
            Keep it
          </Button>
        </div>
      ) : null}
      <AddPeopleSheet open={adding} onOpenChange={setAdding} goalId={goalId} spaceId={spaceId} spaceName={spaceName} stages={stages} />
    </div>
  );
}

function AddPeopleSheet({ open, onOpenChange, goalId, spaceId, spaceName, stages }: { open: boolean; onOpenChange: (o: boolean) => void; goalId: string; spaceId: string; spaceName: string; stages: Stage[] }) {
  const [stage, setStage] = useState(() => (stages.find((s) => !s.closed) ?? stages[0])?.key ?? "");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const pick = (p: PickedPerson) =>
    start(async () => {
      const r = await addPeopleToGoalAction(goalId, [p.id], stage);
      if (r.message) return setError(r.message);
      setError(null);
      toast.show(r.added ? `${p.name} added.` : `${p.name} is already on this goal.`);
    });
  const addNew = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError("Type their name.");
    start(async () => {
      const r = await addNewPersonToGoalAction(goalId, n, stage);
      if (r.message) return setError(r.message);
      setError(null);
      setName("");
      toast.show(`${n} added to ${spaceName} and this goal.`);
    });
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add people" description={`Only people in ${spaceName} are shown. Pick as many as you like.`}>
      <div className="grid gap-5" aria-busy={pending}>
        <label className="grid gap-1.5 text-small font-[550]">
          Start them at
          <Select value={stage} onChange={(e) => setStage(e.target.value)}>
            {stages.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </label>
        <PersonPicker spaceId={spaceId} onPick={pick} />
        <form onSubmit={addNew} className="grid gap-2 border-t border-border pt-4">
          <Field label="Someone you want to meet" hint={`Not saved yet? Add their name and they'll be added to ${spaceName}. Fill in details later.`}>
            {({ id, describedBy }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-describedby={describedBy} autoComplete="off" />}
          </Field>
          <div>
            <Button type="submit" size="sm" disabled={pending}>
              Add new person
            </Button>
          </div>
        </form>
        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
