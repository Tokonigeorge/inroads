import type { RoomKind } from "@/contracts/rooms";

/**
 * What kind of room a calendar entry is, from its title alone, or null for an ordinary
 * appointment. Used so events you add to your own calendar (no other guests) still become
 * rooms, and so they're prepared like rooms you add by hand. Conservative on purpose:
 * "Lunch with Kemi" is a meeting, "Founders breakfast" is a room.
 */
export function roomKindFromTitle(title: string): RoomKind | null {
  const t = title.toLowerCase();
  if (/\b(conference|summit|festival|expo|forum|convention|demo ?day|tech ?week|startup ?week|fashion ?week|fair)\b/.test(t)) return "conference";
  if (/\b(meet-?up|mixer|networking|happy hour|hangout|social|soir[ée]e|link ?up)\b/.test(t)) return "meetup";
  if (/\b(dinner|breakfast|brunch)\b/.test(t) && !/\bwith\b/.test(t)) return "dinner";
  if (/\b(hackathon|workshop|masterclass|bootcamp|webinar|launch|panel|fireside|town ?hall|retreat)\b/.test(t)) return "community";
  return null;
}
