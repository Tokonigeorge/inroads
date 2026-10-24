import { addDays, diffDays, type IsoDate } from "./dates";

/**
 * Warmth is display only: how long since you last spoke, in plain words. Reminders come from
 * cadence (below), which the user sets.
 */
export type Warmth = { key: "recent" | "warm" | "cooling" | "cold" | "none"; days: number | null; label: string };

export function warmth(lastTouchedOn: IsoDate | null | undefined, today: IsoDate): Warmth {
  if (!lastTouchedOn) return { key: "none", days: null, label: "No touches yet" };
  const days = Math.max(0, diffDays(lastTouchedOn, today));
  const key = days <= 14 ? "recent" : days <= 45 ? "warm" : days <= 90 ? "cooling" : "cold";
  return { key, days, label: sinceLabel(days) };
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
