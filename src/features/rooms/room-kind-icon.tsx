import { Coffee, Mic, PartyPopper, UsersRound, UtensilsCrossed, Handshake, CalendarDays, type LucideIcon } from "lucide-react";
import type { RoomKind } from "@/contracts/rooms";
import { cn } from "@/ui/cn";

const icons: Record<RoomKind, LucideIcon> = {
  meeting: Coffee,
  conference: Mic,
  mixer: PartyPopper,
  dinner: UtensilsCrossed,
  meetup: UsersRound,
  community: Handshake,
  other: CalendarDays,
};

/** A small tile with an icon for the kind of room (a conference, a dinner…), so lists scan at a glance. */
export function RoomKindIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = icons[kind as RoomKind] ?? CalendarDays;
  return (
    <span aria-hidden className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent", className)}>
      <Icon size={16} strokeWidth={1.75} />
    </span>
  );
}
