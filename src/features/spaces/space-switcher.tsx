"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { cn } from "@/ui/cn";
import { selectSpaceAction } from "./actions";

type Props = { spaces: { id: string; name: string }[]; selectedId: string | null; className?: string };

/** "All spaces" or one Space. Lists and Today follow this choice; AI always works per Space. */
export function SpaceSwitcher({ spaces, selectedId, className }: Props) {
  const [pending, start] = useTransition();
  const [current, setCurrent] = useOptimistic(selectedId);
  const label = spaces.find((s) => s.id === current)?.name ?? "All spaces";
  const choose = (id: string | null) =>
    start(async () => {
      setCurrent(id);
      await selectSpaceAction(id ?? "all");
    });
  const items: { id: string | null; name: string }[] = [{ id: null, name: "All spaces" }, ...spaces];
  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          "inline-flex h-9 max-w-full items-center gap-1.5 rounded-md px-2.5 font-[550] hover:bg-sunken data-[state=open]:bg-sunken",
          pending && "opacity-70",
          className,
        )}
        aria-label={`Space: ${label}. Change Space`}
      >
        <span className="truncate">{label}</span>
        <ChevronsUpDown size={14} className="shrink-0 text-muted" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="start" sideOffset={4} className="z-50 min-w-[200px] rounded-lg bg-surface p-1 shadow-pop">
          {items.map((s) => (
            <Menu.Item
              key={s.id ?? "all"}
              onSelect={() => choose(s.id)}
              className="flex h-9 cursor-default items-center justify-between gap-6 rounded-md px-2.5 outline-none data-[highlighted]:bg-sunken"
            >
              {s.name}
              {s.id === current ? <Check size={14} className="text-accent" aria-label="Selected" /> : null}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
