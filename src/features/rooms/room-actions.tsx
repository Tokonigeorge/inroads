"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { roomRoleLabels, roomRoles, type RoomRole } from "@/contracts/rooms";
import type { PickedPerson } from "@/features/people/capture-forms";
import { PersonPicker } from "@/features/people/person-picker";
import { Button } from "@/ui/button";
import { Segmented } from "@/ui/field";
import { Sheet } from "@/ui/sheet";
import { useToast } from "@/ui/toast";
import { useShortcut } from "@/ui/use-shortcut";
import { deleteRoomAction, linkPersonAction, restoreRoomAction, setAttendanceAction, unlinkPersonAction } from "./actions";

export function RoomActions({ roomId, title, spaceId }: { roomId: string; title: string; spaceId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);
  useShortcut("e", () => router.push(`/rooms/${roomId}/edit`));
  const remove = () =>
    start(async () => {
      await deleteRoomAction(roomId);
      router.push("/rooms");
      router.refresh();
      toast.show(`${title} deleted.`, {
        label: "Undo",
        onClick: () => start(async () => {
          await restoreRoomAction(roomId);
          router.push(`/rooms/${roomId}`);
        }),
      });
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" onClick={() => setAdding(true)}>
        Add people
      </Button>
      <Button asChild variant="ghost">
        <Link href={`/rooms/${roomId}/edit`}>Edit</Link>
      </Button>
      <Menu.Root>
        <Menu.Trigger className="flex size-10 items-center justify-center rounded-md text-muted hover:bg-sunken" aria-label="More actions">
          <MoreHorizontal size={18} aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="end" sideOffset={4} className="z-50 min-w-[180px] rounded-lg bg-surface p-1 shadow-pop">
            <Menu.Item onSelect={remove} className="flex h-9 items-center rounded-md px-2.5 text-danger outline-none data-[highlighted]:bg-sunken">
              Delete room
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <AddPeopleSheet open={adding} onOpenChange={setAdding} roomId={roomId} spaceId={spaceId} />
    </div>
  );
}

function AddPeopleSheet({ open, onOpenChange, roomId, spaceId }: { open: boolean; onOpenChange: (o: boolean) => void; roomId: string; spaceId: string }) {
  const [role, setRole] = useState<RoomRole>("attendee");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const pick = (p: PickedPerson) =>
    start(async () => {
      const r = await linkPersonAction(roomId, p.id, role);
      if (r.message) return setError(r.message);
      setError(null);
      toast.show(`${p.name} added.`);
    });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add people" description="Only people in this room's Space are shown. Pick as many as you like.">
      <div className="grid gap-4" aria-busy={pending}>
        <Segmented legend="Role" name="role" value={role} onChange={setRole} options={roomRoles.map((r) => ({ value: r, label: roomRoleLabels[r] }))} />
        <PersonPicker spaceId={spaceId} onPick={pick} />
        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

export function UnlinkButton({ roomId, personId, role, name }: { roomId: string; personId: string; role: RoomRole; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => unlinkPersonAction(roomId, personId, role))}
      aria-label={`Remove ${name} from this room`}
      className="shrink-0 rounded-md px-2 py-1 text-small text-muted hover:bg-sunken hover:text-text"
    >
      Remove
    </button>
  );
}

/** Went / didn't go for one session. Clicking the chosen option again clears it. */
export function AttendanceToggle({ roomId, date, label, attended }: { roomId: string; date: string; label: string; attended: boolean | null }) {
  const [value, setValue] = useState(attended);
  const [pending, start] = useTransition();
  const toast = useToast();
  const choose = (next: boolean) =>
    start(async () => {
      const target = value === next ? null : next;
      setValue(target);
      const r = await setAttendanceAction(roomId, date, target);
      if (r.message) {
        setValue(value);
        toast.show(r.message);
      }
    });
  return (
    <div role="group" aria-label={`Did you go on ${label}?`} className="flex gap-1" aria-busy={pending}>
      {([
        [true, "Went"],
        [false, "Didn't go"],
      ] as const).map(([v, text]) => (
        <button
          key={text}
          type="button"
          aria-pressed={value === v}
          onClick={() => choose(v)}
          className="rounded-md border border-border px-2.5 py-1 text-small font-[550] text-muted aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
