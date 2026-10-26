import { diffDays, type IsoDate } from "./dates";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Milliseconds since the epoch, for "written 2 h ago" labels on the server. */
export const nowMs = () => Date.now();

/** The hour (0–23) right now in an IANA time zone. */
export function hourIn(timeZone: string, now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now)) % 24;
}

type Input = {
  firstName: string;
  hour: number;
  today: IsoDate;
  /** Titles of today's rooms, soonest first. */
  todayRooms: string[];
  /** Rooms after today, within the week, soonest first. */
  weekRooms: { title: string; date: IsoDate }[];
  /** Follow-up cards waiting. */
  followUps: number;
};

/**
 * Today's greeting: hello for the time of day, then the one thing that's ahead
 * ("Moonshot on Wednesday", "2 rooms today"), or a nudge when the day is quiet.
 */
export function greeting(i: Input): { hello: string; ahead: string } {
  const part = i.hour < 5 ? "Working late" : i.hour < 12 ? "Good morning" : i.hour < 17 ? "Good afternoon" : "Good evening";
  const hello = i.firstName ? `${part}, ${i.firstName}.` : `${part}.`;
  if (i.todayRooms.length === 1) return { hello, ahead: `${i.todayRooms[0]} is today.` };
  if (i.todayRooms.length > 1) return { hello, ahead: `${i.todayRooms.length} rooms today, starting with ${i.todayRooms[0]}.` };
  const next = i.weekRooms[0];
  if (next) {
    const days = diffDays(i.today, next.date);
    const when = days === 1 ? "tomorrow" : `on ${WEEKDAYS[new Date(`${next.date}T00:00:00Z`).getUTCDay()]}`;
    const more = i.weekRooms.length - 1;
    return { hello, ahead: more ? `Big week: ${next.title} ${when}, and ${more} more ${more === 1 ? "room" : "rooms"}.` : `Coming up: ${next.title} ${when}.` };
  }
  if (i.followUps) return { hello, ahead: i.followUps === 1 ? "One thing to follow up on." : `${i.followUps} things to follow up on.` };
  return { hello, ahead: "A quiet day: a good one to get back in touch with someone." };
}
