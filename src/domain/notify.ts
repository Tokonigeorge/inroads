import { addDays, diffDays, type IsoDate } from "./dates";
import { occurrences } from "./recurrence";
import { instantInZone, zonedToInstant, type RoomTiming } from "./zoned";

/**
 * When to nudge (push notifications): right after a meeting from your calendar ends, and a
 * wrap-up every few days at a time you choose. Pure, so the schedule can be tested.
 */

export type TimedRoom = RoomTiming & { title: string; endTime: string | null };
export type EndedMeeting = { eventId: string; occurrenceOn: IsoDate; title: string; endsAt: Date };

/** A meeting with no end time is taken to last an hour. */
const DEFAULT_MINUTES = 60;

/** Sessions (not all-day) that ended after `from` and by `to`. */
export function meetingsEndedBetween(rooms: TimedRoom[], from: Date, to: Date): EndedMeeting[] {
  const out: EndedMeeting[] = [];
  for (const r of rooms) {
    if (r.allDay || !r.startTime) continue;
    // Look a day either side in the room's own zone; the window itself is checked on instants.
    const day = instantInZone(to, r.tz).date;
    for (const occ of occurrences(r, addDays(day, -1), addDays(day, 1))) {
      const starts = zonedToInstant(occ, r.startTime, r.tz);
      let ends = r.endTime ? zonedToInstant(occ, r.endTime.slice(0, 5), r.tz) : new Date(starts.getTime() + DEFAULT_MINUTES * 60_000);
      // An end time earlier than the start runs past midnight.
      if (ends <= starts) ends = new Date(ends.getTime() + 86_400_000);
      if (ends > from && ends <= to) out.push({ eventId: r.id, occurrenceOn: occ, title: r.title, endsAt: ends });
    }
  }
  return out.sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
}

export type TimedPromise = { id: string; text: string; dueOn: IsoDate; dueTime: string; personId: string; name: string };

/** Promises you owe whose time (on their due day, in your zone) fell after `from` and by `to`. */
export function promisesDueBetween(promises: TimedPromise[], tz: string, from: Date, to: Date): TimedPromise[] {
  return promises.filter((p) => {
    const at = zonedToInstant(p.dueOn, p.dueTime.slice(0, 5), tz);
    return at > from && at <= to;
  });
}

/**
 * Is a wrap-up due now? Every `everyDays` days (0 = off), in the half hour after `time` in your
 * zone, and not if one went out fewer than `everyDays` days ago.
 */
export function wrapUpDue(opts: { now: Date; tz: string; time: string; everyDays: number; lastSentOn: IsoDate | null }): IsoDate | null {
  if (opts.everyDays <= 0) return null;
  const local = instantInZone(opts.now, opts.tz);
  const [h, m] = opts.time.slice(0, 5).split(":").map(Number);
  const [nh, nm] = local.time.split(":").map(Number);
  const minutes = nh * 60 + nm - (h * 60 + m);
  if (minutes < 0 || minutes >= 30) return null;
  if (opts.lastSentOn && diffDays(opts.lastSentOn, local.date) < opts.everyDays) return null;
  return local.date;
}
