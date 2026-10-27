import { addDays, diffDays, type IsoDate } from "./dates";

/**
 * Warmth is display only: how long since you last spoke, in plain words. Reminders come from
 * cadence (below), which the user sets.
 */
export type Warmth = { key: "recent" | "warm" | "cooling" | "cold" | "none"; days: number | null; label: string };

/** The prototype's names for each band (L577–585), for the warmth ring legend and tags. */
export const warmthBand: Record<Warmth["key"], string> = { recent: "Hot", warm: "Warm", cooling: "Cooling", cold: "Cold", none: "No touches yet" };

export function warmth(lastTouchedOn: IsoDate | null | undefined, today: IsoDate): Warmth {
  if (!lastTouchedOn) return { key: "none", days: null, label: "No touches yet" };
  const days = Math.max(0, diffDays(lastTouchedOn, today));
  const key = days <= 14 ? "recent" : days <= 45 ? "warm" : days <= 90 ? "cooling" : "cold";
  return { key, days, label: sinceLabel(days) };
}

/** How far back strength counts touches. */
export const STRENGTH_WINDOW_DAYS = 180;

export type Strength = { value: number; label: "Strong" | "Good" | "Fading" | "Weak"; why: string };

export const strengthLabel = (value: number): Strength["label"] => (value >= 70 ? "Strong" : value >= 40 ? "Good" : value >= 20 ? "Fading" : "Weak");

/**
 * Relationship strength, 0–100 (Affinity-style): how recently you were in touch (fades over
 * months) and how often in the last six months (six or more touches counts as often). A number
 * to sort and compare by; warmth stays the plain "how long since" label. Null with no touches.
 * Mirrored in SQL by `strengthSql` (repos/people.ts) for sorting: keep them the same.
 */
export function strength(args: { lastTouchedOn: IsoDate | null | undefined; touches: number; today: IsoDate }): Strength | null {
  if (!args.lastTouchedOn) return null;
  const days = Math.max(0, diffDays(args.lastTouchedOn, args.today));
  const recency = 100 * Math.exp(-days / 75);
  const frequency = Math.min(1, args.touches / 6) * 100;
  const value = Math.round(0.55 * recency + 0.45 * frequency);
  const label = strengthLabel(value);
  const n = args.touches;
  return { value, label, why: `${n === 0 ? "No touches" : n === 1 ? "1 touch" : `${n} touches`} in 6 months, last ${sinceLabel(days).toLowerCase()}` };
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", "4 months ago", "over a year ago". */
export function sinceLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return "Over a year ago";
}

/**
 * The reminder interval for one Space membership: the person's own setting, else their
 * circle's, else the Space default. 0 or null means never remind.
 */
export function effectiveCadence(person: number | null | undefined, circle: number | null | undefined, space: number | null | undefined): number | null {
  const v = person ?? circle ?? space ?? null;
  return v && v > 0 ? v : null;
}

/** Across a person's Spaces the shortest reminder wins; seeing them anywhere counts as a touch. */
export function personCadence(memberships: (number | null)[]): number | null {
  const set = memberships.filter((x): x is number => typeof x === "number" && x > 0);
  return set.length ? Math.min(...set) : null;
}

/**
 * When you're next due to be in touch. Without any touch, the clock starts from when they were
 * sorted (triage) or added, so imported contacts don't hide forever.
 */
export function dueOn(args: { lastTouchedOn: IsoDate | null; anchorOn: IsoDate | null; createdOn: IsoDate; cadenceDays: number | null }): IsoDate | null {
  if (!args.cadenceDays) return null;
  return addDays(args.lastTouchedOn ?? args.anchorOn ?? args.createdOn, args.cadenceDays);
}

export type DueState = { due: boolean; overdueDays: number; label: string } | null;

export function dueState(due: IsoDate | null, today: IsoDate): DueState {
  if (!due) return null;
  const d = diffDays(today, due);
  if (d > 0) return { due: false, overdueDays: 0, label: d === 1 ? "Due tomorrow" : d < 14 ? `Due in ${d} days` : `Due in ${Math.round(d / 7)} weeks` };
  if (d === 0) return { due: true, overdueDays: 0, label: "Due today" };
  return { due: true, overdueDays: -d, label: -d === 1 ? "1 day overdue" : -d < 14 ? `${-d} days overdue` : `${Math.round(-d / 7)} weeks overdue` };
}
