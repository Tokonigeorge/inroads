/**
 * Repeating rooms. Ported from the prototype's occurrences() / nthWeekday() / rruleToRecur()
 * (prototype/index.html) with the same behaviour, but on ISO calendar dates with UTC maths so
 * results never depend on the machine's time zone. Dates are wall-clock dates in the event's
 * own time zone; converting to instants happens in zoned.ts.
 */
import { addDays, diffDays, isIsoDate, weekday, type IsoDate } from "./dates";

export const recurFreqs = ["none", "weekly", "biweekly", "monthly", "quarterly", "yearly"] as const;
export type RecurFreq = (typeof recurFreqs)[number];

export type Nth = { n: number; dow: number }; // n: 1..5 or -1 (last), -2 (second to last); dow: 0 = Sunday
export type Recurrence = { freq: RecurFreq; byDays?: number[] | null; nth?: Nth | null; until?: IsoDate | null };
export type Series = Recurrence & { start: IsoDate };

const iso = (y: number, m0: number, d: number): IsoDate => new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);
const ymd = (s: IsoDate) => s.split("-").map(Number) as [number, number, number];

/** The nth weekday of a month (month index may overflow, like Date). null if it doesn't exist. */
export function nthWeekday(y: number, m0: number, n: number, dow: number): IsoDate | null {
  const first = new Date(Date.UTC(y, m0, 1));
  const yy = first.getUTCFullYear();
  const mm = first.getUTCMonth();
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  if (n > 0) {
    const d = 1 + ((dow - first.getUTCDay() + 7) % 7) + (n - 1) * 7;
    return d <= last ? iso(yy, mm, d) : null;
  }
  const lastDow = new Date(Date.UTC(yy, mm, last)).getUTCDay();
  const d = last - ((lastDow - dow + 7) % 7) + (n + 1) * 7;
  return d >= 1 ? iso(yy, mm, d) : null;
}

/** Every date the series happens on between from and to (inclusive), in order. */
export function occurrences(e: Series, from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  if (!isIsoDate(e.start)) return out;
  const freq = e.freq ?? "none";
  const end = e.until && isIsoDate(e.until) && e.until < to ? e.until : to;
  if (freq === "none") {
    if (e.start >= from && e.start <= to) out.push(e.start);
    return out;
  }

  const step = freq === "weekly" ? 7 : freq === "biweekly" ? 14 : 0;
  if (step && e.byDays?.length) {
    const mon = (dw: number) => (dw + 6) % 7; // Monday-first offset
    const days = e.byDays.map(Number).filter((x) => x >= 0 && x <= 6).sort((a, b) => mon(a) - mon(b));
    let wk = addDays(e.start, -mon(weekday(e.start)));
    if (wk < from) wk = addDays(wk, Math.max(0, Math.floor(diffDays(wk, from) / step) - 1) * step);
    for (let g = 0; wk <= end && g < 800; g++) {
      for (const dw of days) {
        const d = addDays(wk, mon(dw));
        if (d >= e.start && d >= from && d <= end) out.push(d);
      }
      wk = addDays(wk, step);
    }
    return out;
  }
  if (step) {
    let d = e.start;
    if (d < from) d = addDays(d, Math.ceil(diffDays(d, from) / step) * step);
    for (let g = 0; d <= end && g < 800; g++) {
      out.push(d);
      d = addDays(d, step);
    }
    return out;
  }

  const months = freq === "monthly" ? 1 : freq === "quarterly" ? 3 : freq === "yearly" ? 12 : 0;
  if (!months) return out;
  const [sy, sm, day] = ymd(e.start);
  const [fy, fm] = ymd(from);
  const md = (fy - sy) * 12 + (fm - sm);
  let k = md > months ? Math.floor(md / months) - 1 : 0;
  for (let g = 0; g < 600; g++, k++) {
    const m0 = sm - 1 + k * months;
    const lastDay = new Date(Date.UTC(sy, m0 + 1, 0)).getUTCDate();
    const date = e.nth && freq !== "yearly" ? nthWeekday(sy, m0, e.nth.n, e.nth.dow) : iso(sy, m0, Math.min(day, lastDay));
    if (!date) {
      if (iso(sy, m0, 1) > end) break;
      continue;
    }
    if (date > end) break;
    if (date >= from && date >= e.start) out.push(date);
  }
  return out;
}

/** Next occurrence on or after `from`, looking up to ~3 years ahead. */
export function nextOccurrence(e: Series, from: IsoDate): IsoDate | null {
  return occurrences(e, from, addDays(from, 1100))[0] ?? null;
}

/* ---------- labels ---------- */

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORD: Record<string, string> = { "1": "first", "2": "second", "3": "third", "4": "fourth", "5": "fifth", "-1": "last", "-2": "second to last" };
export const freqLabels: Record<RecurFreq, string> = {
  none: "Doesn't repeat",
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every month",
  quarterly: "Every 3 months",
  yearly: "Every year",
};

export function nthLabel(nth: Nth) {
  return `the ${ORD[String(nth.n)] ?? `${nth.n}th`} ${DOW[nth.dow]}`;
}

/** "Every week on Mon, Wed", "Every month on the last Friday", "Every 3 months". */
export function recurrenceLabel(r: Recurrence): string {
  const base = freqLabels[r.freq];
  if ((r.freq === "weekly" || r.freq === "biweekly") && r.byDays?.length) {
    const days = [...r.byDays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DOW_SHORT[d]);
    return `${base} on ${days.join(", ")}`;
  }
  if ((r.freq === "monthly" || r.freq === "quarterly") && r.nth) return `${base} on ${nthLabel(r.nth)}`;
  return base;
}

/** For a start date, the "nth weekday" choices a monthly event could use (e.g. 2nd Tue, last Tue). */
export function nthChoicesFor(start: IsoDate): Nth[] {
  const [, , d] = ymd(start);
  const dow = weekday(start);
  const n = Math.ceil(d / 7);
  const [y, m] = ymd(start);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const choices: Nth[] = n <= 4 ? [{ n, dow }] : [];
  if (d + 7 > last) choices.push({ n: -1, dow });
  return choices;
}

/* ---------- RRULE (RFC 5545 subset) ---------- */

const DAYCODE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Our canonical RRULE text (no UNTIL: the end date lives in its own column). null for one-offs. */
export function toRRule(r: Recurrence): string | null {
  const parts: string[] = [];
  switch (r.freq) {
    case "none":
      return null;
    case "weekly":
    case "biweekly":
      parts.push("FREQ=WEEKLY");
      if (r.freq === "biweekly") parts.push("INTERVAL=2");
      if (r.byDays?.length) parts.push(`BYDAY=${[...r.byDays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAYCODE[d]).join(",")}`);
      break;
    case "monthly":
    case "quarterly":
      parts.push("FREQ=MONTHLY");
      if (r.freq === "quarterly") parts.push("INTERVAL=3");
      if (r.nth) parts.push(`BYDAY=${r.nth.n}${DAYCODE[r.nth.dow]}`);
      break;
    case "yearly":
      parts.push("FREQ=YEARLY");
      break;
  }
  return parts.join(";");
}

/** Parses an RRULE (from our own column or a calendar feed). `unsupported` marks rules we can't represent. */
export function fromRRule(rrule: string | null | undefined, start: IsoDate): Recurrence & { unsupported: boolean } {
  if (!rrule) return { freq: "none", until: null, unsupported: false };
  const p = Object.fromEntries(
    rrule
      .replace(/^RRULE:/i, "")
      .split(";")
      .map((x) => x.split("="))
      .map(([k, v]) => [String(k).toUpperCase(), String(v ?? "")]),
  );
  const n = Number(p.INTERVAL || 1);
  const until = p.UNTIL ? untilDate(p.UNTIL) : null;
  const by = (p.BYDAY || "")
    .split(",")
    .filter(Boolean)
    .map((x) => {
      const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x);
      return m ? { n: m[1] ? Number(m[1]) : 0, dow: DAYCODE.indexOf(m[2]) } : null;
    })
    .filter((x): x is { n: number; dow: number } => x !== null);

  let freq: RecurFreq | "" = "";
  const extra: Pick<Recurrence, "byDays" | "nth"> = {};
  if (p.FREQ === "WEEKLY" && (n === 1 || n === 2)) {
    freq = n === 2 ? "biweekly" : "weekly";
    const days = [...new Set(by.map((b) => b.dow))];
    if (days.length > 1 || (days.length === 1 && isIsoDate(start) && days[0] !== weekday(start))) extra.byDays = days.sort();
  } else if (p.FREQ === "MONTHLY" && (n === 1 || n === 3)) {
    freq = n === 3 ? "quarterly" : "monthly";
    if (by.length === 1 && by[0].n) extra.nth = { n: by[0].n, dow: by[0].dow };
    else if (by.length === 1 && p.BYSETPOS) extra.nth = { n: Number(p.BYSETPOS), dow: by[0].dow };
  } else if (p.FREQ === "YEARLY" && n === 1) freq = "yearly";
  else if (p.FREQ === "DAILY" && (n === 7 || n === 14)) freq = n === 7 ? "weekly" : "biweekly";

  const r: Recurrence & { unsupported: boolean } = { freq: freq || "none", until, ...extra, unsupported: !freq };
  if (freq && p.COUNT && isIsoDate(start)) {
    const occ = occurrences({ start, ...r, until: null }, start, addDays(start, 3660));
    const c = Number(p.COUNT);
    if (c >= 1 && occ.length >= c) r.until = occ[c - 1];
  }
  return r;
}

function untilDate(v: string): IsoDate | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
