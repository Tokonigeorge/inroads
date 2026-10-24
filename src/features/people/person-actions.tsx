"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendCapture } from "@/features/offline/outbox";
import { useCapture } from "@/features/shell/capture-sheet";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/toast";
import { useShortcut } from "@/ui/use-shortcut";
import { deletePersonAction, deletePromiseAction, deleteTouchAction, removeFromSpaceAction, restorePersonAction, setArchivedAction } from "./actions";
import type { PickedPerson } from "./capture-forms";
import { useAfterCapture } from "./capture-forms";

/** Header actions on a person's page: Log a touch, Add a promise, Edit, and More. */
export function PersonActions({ person, archived, defaultSpaceId }: { person: PickedPerson; archived: boolean; defaultSpaceId?: string }) {
  const capture = useCapture();
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  useShortcut("l", () => capture.open({ mode: "touch", person, spaceId: defaultSpaceId }));
  useShortcut("e", () => router.push(`/people/${person.id}/edit`));

  const remove = () =>
    start(async () => {
      await deletePersonAction(person.id);
      router.push("/people");
      router.refresh();
      toast.show(`${person.name} deleted.`, {
        label: "Undo",
        onClick: () => start(async () => {
          await restorePersonAction(person.id);
          router.push(`/people/${person.id}`);
        }),
      });
    });
  const archive = (to: boolean) =>
    start(async () => {
      await setArchivedAction(person.id, to);
      toast.show(to ? `${person.name} archived. They won't appear in lists or reminders.` : `${person.name} is back.`, to ? { label: "Undo", onClick: () => start(() => setArchivedAction(person.id, false)) } : undefined);
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" onClick={() => capture.open({ mode: "touch", person, spaceId: defaultSpaceId })}>
        Log a touch
      </Button>
      <Button onClick={() => capture.open({ mode: "promise", person, spaceId: defaultSpaceId })}>Add a promise</Button>
      <Button asChild variant="ghost">
        <Link href={`/people/${person.id}/edit`}>Edit</Link>
      </Button>
      <Menu.Root>
        <Menu.Trigger className="flex size-10 items-center justify-center rounded-md text-muted hover:bg-sunken" aria-label="More actions">
          <MoreHorizontal size={18} aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="end" sideOffset={4} className="z-50 min-w-[200px] rounded-lg bg-surface p-1 shadow-pop">
            <Menu.Item asChild className="flex h-9 items-center rounded-md px-2.5 outline-none data-[highlighted]:bg-sunken">
              <Link href={`/people/${person.id}/spaces/new`}>Add to another Space</Link>
            </Menu.Item>
            <Menu.Item onSelect={() => archive(!archived)} className="flex h-9 items-center rounded-md px-2.5 outline-none data-[highlighted]:bg-sunken">
              {archived ? "Unarchive" : "Archive"}
            </Menu.Item>
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item onSelect={remove} className="flex h-9 items-center rounded-md px-2.5 text-danger outline-none data-[highlighted]:bg-sunken">
              Delete
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

/** Tick a promise done (works offline). */
export function PromiseCheck({ id, done, label }: { id: string; done: boolean; label: string }) {
  const [checked, setChecked] = useState(done);
  const after = useAfterCapture();
  const toast = useToast();
  return (
    <input
      type="checkbox"
      checked={checked}
      aria-label={checked ? `Mark "${label}" as not done` : `Mark "${label}" as done`}
      className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
      onChange={async (e) => {
        const next = e.target.checked;
        setChecked(next);
        const r = await sendCapture({ kind: "promise_done", data: { id, done: next } });
        if (!after(r, next ? "Marked done." : "Marked not done.")) {
          setChecked(!next);
          if (!r.ok) toast.show(r.message);
        }
      }}
    />
  );
}

export function DeleteButton({ kind, id, label }: { kind: "touch" | "promise"; id: string; label: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Delete ${label}`}
      className="shrink-0 rounded-md px-2 py-1 text-small text-muted opacity-70 hover:bg-sunken hover:opacity-100"
      onClick={() =>
        start(async () => {
          await (kind === "touch" ? deleteTouchAction(id) : deletePromiseAction(id));
          toast.show(kind === "touch" ? "Touch deleted." : "Promise deleted.");
        })
      }
    >
      Delete
    </button>
  );
}

export function RemoveFromSpaceButton({ personId, spaceId, spaceName, personName }: { personId: string; spaceId: string; spaceName: string; personName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        Remove from {spaceName}
      </Button>
    );
  }
  return (
    <div className="grid gap-2 rounded-md bg-sunken p-3">
      <p className="text-small">
        Remove {personName} from {spaceName}? The notes, touches and promises you logged there are deleted. Their other Spaces stay as they are.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await removeFromSpaceAction(personId, spaceId);
              if (r.message) setError(r.message);
              else toast.show(`Removed from ${spaceName}.`);
            })
          }
        >
          Remove
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Keep
        </Button>
      </div>
      {error ? <p className="text-small text-danger">{error}</p> : null}
    </div>
  );
}
