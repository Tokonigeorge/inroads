/**
 * Calendar-date helpers on ISO `YYYY-MM-DD` strings. Pure integer maths in UTC, so results never
 * depend on the server's or browser's local time zone. "Today" is always asked for in a named zone.
 */

export type IsoDate = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: unknown): s is IsoDate {
  if (typeof s !== "string") return false;
  const m = ISO.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function parts(iso: IsoDate): [number, number, number] {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`Not an ISO date: ${iso}`);
  return [+m[1], +m[2], +m[3]];
}

const fmt = (d: Date): IsoDate => d.toISOString().slice(0, 10);

/** The calendar date right now in an IANA time zone, e.g. todayIn("Africa/Lagos"). */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  const [y, m, d] = parts(iso);
  return fmt(new Date(Date.UTC(y, m - 1, d + n)));
}

/** Adds months, clamping to the last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: IsoDate, n: number): IsoDate {
  const [y, m, d] = parts(iso);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))));
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 864e5);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: IsoDate): number {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "Thursday 23 October", adding the year only when it isn't `relativeTo`'s year. */
export function formatLongDate(iso: IsoDate, relativeTo?: IsoDate): string {
  const [y, m, d] = parts(iso);
  const sameYear = relativeTo ? parts(relativeTo)[0] === y : true;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(",", "");
}
