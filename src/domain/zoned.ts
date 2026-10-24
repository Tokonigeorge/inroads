/**
 * Wall-clock times in named time zones. A room happens at a local date and time in its own
 * zone (stored on the event); the user sees it in their profile's zone. Pure Intl, no
 * dependency on the machine's zone.
 */
import { addDays, type IsoDate } from "./dates";
import { occurrences, type Series } from "./recurrence";

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(tz, f);
  }
  return f;
}

function parts(t: number, tz: string) {
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

function offsetMs(t: number, tz: string) {
  const p = parts(t, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - t;
}

export function isValidTimeZone(tz: string) {
  try {
    fmt(tz);
    return true;
  } catch {
    return false;
  }
}

/** The instant a local date and "HH:MM" time in `tz` refers to (handles DST changes). */
export function zonedToInstant(date: IsoDate, time: string, tz: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi || 0, 0);
  const o1 = offsetMs(guess, tz);
  let t = guess - o1;
  const o2 = offsetMs(t, tz);
  if (o2 !== o1) t = guess - o2;
  return new Date(t);
}

/** Local date and "HH:MM" of an instant in `tz`. */
export function instantInZone(instant: Date, tz: string): { date: IsoDate; time: string } {
  const p = parts(instant.getTime(), tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

/** "18:30" → "6:30pm". */
export function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h >= 12 ? "pm" : "am"}`;
}

/** "Europe/London" → "London". */
export function zoneCity(tz: string) {
  return tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
}

export type RoomTiming = Series & { id: string; startTime: string | null; allDay: boolean; tz: string };

export type AgendaItem = {
  eventId: string;
  /** The occurrence date in the event's own zone (attendance and links use this). */
  occurrenceOn: IsoDate;
  /** The date the user sees it on, in their zone. */
  date: IsoDate;
  /** "HH:MM" in the user's zone, or null for all-day rooms. */
  time: string | null;
  startsAt: Date | null;
  /** Set when the room's own zone differs from the user's, e.g. "9:00am London". */
  localTimeLabel: string | null;
};

/**
 * Every occurrence of `rooms` that falls between `from` and `to` (dates in the user's zone),
 * sorted by when it starts. The window is widened by a day each side before converting, so a
 * 8pm New York meeting correctly lands on the next day in Lagos.
 */
export function expandAgenda(rooms: RoomTiming[], from: IsoDate, to: IsoDate, userTz: string): AgendaItem[] {
  const out: AgendaItem[] = [];
  for (const r of rooms) {
    for (const occ of occurrences(r, addDays(from, -1), addDays(to, 1))) {
      if (r.allDay || !r.startTime) {
        if (occ >= from && occ <= to) out.push({ eventId: r.id, occurrenceOn: occ, date: occ, time: null, startsAt: null, localTimeLabel: null });
        continue;
      }
      const startsAt = zonedToInstant(occ, r.startTime, r.tz);
      const local = instantInZone(startsAt, userTz);
      if (local.date < from || local.date > to) continue;
      out.push({
        eventId: r.id,
        occurrenceOn: occ,
        date: local.date,
        time: local.time,
        startsAt,
        localTimeLabel: r.tz !== userTz ? `${formatTime(r.startTime.slice(0, 5))} ${zoneCity(r.tz)}` : null,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.eventId.localeCompare(b.eventId));
}
