/**
 * Today's reminders. A port of the prototype's buildNudges() with TECH_PLAN §4.5's changes:
 * "due" follows the reminder you set (person → circle → Space), not a score; promises run
 * both ways; imports waiting to be sorted get one small card a day. Pure: the repo loads a
 * snapshot, this decides what to show.
 */
import { addDays, diffDays, formatLongDate, weekday, type IsoDate } from "./dates";
import { sinceLabel } from "./relationship";
import { formatTime } from "./zoned";

export type NudgePerson = { id: string; name: string; detail: string };

export type NudgeSnapshot = {
  today: IsoDate;
  birthdays: (NudgePerson & { birthday: string })[];
  due: (NudgePerson & { dueOn: IsoDate; lastTouchedOn: IsoDate | null; cadenceDays: number })[];
  /** Open promises you made, due within 3 days or undated. */
  owed: { id: string; person: NudgePerson; text: string; dueOn: IsoDate | null }[];
  /** Open promises they made you, past their date. */
  owedToMe: { id: string; person: NudgePerson; text: string; dueOn: IsoDate }[];
  /** People you're meeting in the next 3 days, one row per person and session. */
  meetings: { person: NudgePerson; eventId: string; title: string; date: IsoDate; time: string | null; lastTouch: { on: IsoDate; summary: string } | null; promise: string | null }[];
  /** People added by hand in the last 14 days with no context yet. */
  needContext: (NudgePerson & { createdOn: IsoDate })[];
  /** Rooms (not 1:1 meetings) in the next 7 days, from tomorrow. */
  rooms: { eventId: string; title: string; date: IsoDate; time: string | null; location: string | null }[];
  triagePending: number;
  /** Possible duplicates from imports waiting for review. */
  duplicates?: number;
  /** Keys snoozed or dismissed right now. */
  hidden: Set<string>;
};

export type NudgeKind = "birthday" | "promise" | "owed_to_me" | "due" | "prep" | "context" | "room" | "triage" | "duplicates";
export type NudgeAction =
  | { type: "promise_done"; commitmentId: string; label: string }
  | { type: "log_touch"; personId: string; label: string }
  | { type: "open_person"; personId: string; label: string }
  | { type: "edit_person"; personId: string; label: string }
  | { type: "open_room"; eventId: string; label: string }
  | { type: "sort"; label: string }
  | { type: "review_duplicates"; label: string }
  | { type: "snooze"; days: number; label: string }
  | { type: "dismiss"; label: string };

export type Nudge = {
  key: string;
  kind: NudgeKind;
  priority: number;
  label: string;
  title: string;
  body: string;
  person: { id: string; name: string } | null;
  actions: NudgeAction[];
};

export const MAX_NUDGES = 20;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** The next date (today or later) a "MM-DD" birthday falls on. 29 February is the 28th in other years. */
export function nextBirthday(mmdd: string, today: IsoDate): IsoDate | null {
  const m = /^(\d{2})-(\d{2})$/.exec(mmdd);
  if (!m) return null;
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const day = m[1] === "02" && m[2] === "29" && !isLeap(y) ? "28" : m[2];
    const d = `${y}-${m[1]}-${day}`;
    if (d >= today) return d;
  }
  return null;
}

/** "today", "tomorrow", "on Thursday" (within a week), else the date. */
export function relativeDay(date: IsoDate, today: IsoDate): string {
  const n = diffDays(today, date);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n > 1 && n < 7) return `on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday(date)]}`;
  return `on ${formatLongDate(date, today)}`;
}

const dueLabel = (date: IsoDate, today: IsoDate) => {
  const n = diffDays(today, date);
  return n < 0 ? (n === -1 ? "was due yesterday" : `was due ${-n} days ago`) : n === 0 ? "due today" : `due ${relativeDay(date, today)}`;
};

export function buildNudges(s: NudgeSnapshot): Nudge[] {
  const t = s.today;
  const out: Nudge[] = [];
  const who = (p: NudgePerson) => ({ id: p.id, name: p.name });

  for (const p of s.birthdays) {
    const b = nextBirthday(p.birthday, t);
    if (!b) continue;
    const n = diffDays(t, b);
    if (n < 0 || n > 7) continue;
    out.push({
      key: `bday:${p.id}:${b}`,
      kind: "birthday",
      priority: n === 0 ? 0 : 3,
      label: "Birthday",
      title: `${p.name}'s birthday is ${n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}`,
      body: `${formatLongDate(b, t)}. A short, specific note lands better than a generic one.`,
      person: who(p),
      actions: [
        { type: "log_touch", personId: p.id, label: "Log a touch" },
        { type: "dismiss", label: "Done" },
      ],
    });
  }

  for (const c of s.owed) {
    const n = c.dueOn ? diffDays(t, c.dueOn) : null;
    if (n !== null && n > 3) continue;
    const overdue = n !== null && n < 0;
    out.push({
      key: `p:${c.id}`,
      kind: "promise",
      priority: overdue ? 0 : 1,
      label: overdue ? "Overdue promise" : "Promise",
      title: `You said you'd ${lowerFirst(c.text)}`,
      body: `For ${c.person.name}${c.dueOn ? `, ${dueLabel(c.dueOn, t)}` : ""}.`,
      person: who(c.person),
      actions: [
        { type: "promise_done", commitmentId: c.id, label: "Mark done" },
        { type: "open_person", personId: c.person.id, label: "Open" },
      ],
    });
  }

  for (const c of s.owedToMe) {
    if (c.dueOn >= t) continue;
    out.push({
      key: `them:${c.id}`,
      kind: "owed_to_me",
      priority: 3,
      label: "They owe you",
      title: `${firstName(c.person.name)} said they'd ${lowerFirst(c.text)}`,
      body: `It ${dueLabel(c.dueOn, t)}. A light nudge usually does it.`,
      person: who(c.person),
      actions: [
        { type: "promise_done", commitmentId: c.id, label: "They did it" },
        { type: "log_touch", personId: c.person.id, label: "Log a touch" },
        { type: "snooze", days: 7, label: "Snooze a week" },
      ],
    });
  }

  for (const m of s.meetings) {
    const n = diffDays(t, m.date);
    if (n < 0 || n > 3) continue;
    const bits = [m.lastTouch ? `Last spoke ${formatLongDate(m.lastTouch.on, t)}${m.lastTouch.summary ? `: ${m.lastTouch.summary}` : ""}.` : "You haven't logged a touch with them yet."];
    if (m.promise) bits.push(`You owe them: ${lowerFirst(m.promise)}.`);
    out.push({
      key: `prep:${m.person.id}:${m.eventId}:${m.date}`,
      kind: "prep",
      priority: 1,
      label: "Prep",
      title: `You meet ${firstName(m.person.name)} ${relativeDay(m.date, t)}${m.time ? ` at ${formatTime(m.time)}` : ""}: ${m.title}`,
      body: bits.join(" "),
      person: who(m.person),
      actions: [
        { type: "open_person", personId: m.person.id, label: "Open" },
        { type: "open_room", eventId: m.eventId, label: "See the room" },
      ],
    });
  }

  for (const p of s.due) {
    const since = p.lastTouchedOn ? sinceLabel(diffDays(p.lastTouchedOn, t)).toLowerCase() : null;
    out.push({
      key: `due:${p.id}:${p.dueOn}`,
      kind: "due",
      priority: 2,
      label: "Due for a touch",
      title: since ? `Last spoke with ${p.name} ${since}` : `You haven't spoken with ${p.name} yet`,
      body: `${p.detail ? `${p.detail}. ` : ""}You aim to be in touch every ${p.cadenceDays === 7 ? "week" : p.cadenceDays === 30 ? "month" : `${p.cadenceDays} days`}.`,
      person: who(p),
      actions: [
        { type: "log_touch", personId: p.id, label: "Log a touch" },
        { type: "snooze", days: 14, label: "Snooze 2 weeks" },
        { type: "open_person", personId: p.id, label: "Open" },
      ],
    });
  }

  if (s.triagePending > 0) {
    const batch = Math.min(5, s.triagePending);
    out.push({
      key: `triage:${t}`,
      kind: "triage",
      priority: 2,
      label: "Sort",
      title: `Sort ${batch} new ${batch === 1 ? "person" : "people"}`,
      body: `${s.triagePending.toLocaleString("en-GB")} waiting from your imports. About ${batch * 4} seconds.`,
      person: null,
      actions: [
        { type: "sort", label: "Sort now" },
        { type: "dismiss", label: "Not today" },
      ],
    });
  }

  if ((s.duplicates ?? 0) > 0) {
    const n = s.duplicates!;
    out.push({
      key: `dups:${t}`,
      kind: "duplicates",
      priority: 4,
      label: "Review",
      title: `${n} possible ${n === 1 ? "duplicate" : "duplicates"}`,
      body: "Same name, no shared email or phone. Merge the ones that are the same person.",
      person: null,
      actions: [
        { type: "review_duplicates", label: "Review" },
        { type: "dismiss", label: "Not today" },
      ],
    });
  }

  for (const r of s.rooms) {
    const n = diffDays(t, r.date);
    if (n < 1 || n > 7) continue;
    out.push({
      key: `ev:${r.eventId}:${r.date}`,
      kind: "room",
      priority: 3,
      label: "This week",
      title: r.title,
      body: [formatLongDate(r.date, t), r.time ? formatTime(r.time) : null, r.location].filter(Boolean).join(" · "),
      person: null,
      actions: [
        { type: "open_room", eventId: r.eventId, label: "Open" },
        { type: "dismiss", label: "Hide" },
      ],
    });
  }

  for (const p of s.needContext) {
    if (diffDays(p.createdOn, t) > 14) continue;
    out.push({
      key: `ctx:${p.id}`,
      kind: "context",
      priority: 5,
      label: "Add context",
      title: `What do you remember about ${firstName(p.name)}?`,
      body: "Note where you met and what they're into while it's fresh.",
      person: who(p),
      actions: [
        { type: "edit_person", personId: p.id, label: "Add context" },
        { type: "snooze", days: 3, label: "Later" },
      ],
    });
  }

  // One card per person for "due" when they also have a sharper reason (a promise, a meeting, a birthday).
  const sharper = new Set(out.filter((n) => n.kind !== "due" && n.person).map((n) => n.person!.id));
  return out
    .filter((n) => !s.hidden.has(n.key))
    .filter((n) => n.kind !== "due" || !sharper.has(n.person!.id))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_NUDGES);
}

/** When a snoozed or dismissed state stops applying, and when the row can be deleted. */
export function nudgeStateFor(key: string, action: { type: "snooze"; days: number } | { type: "dismiss" }, now: Date) {
  if (action.type === "snooze") {
    const until = new Date(now.getTime() + action.days * 86_400_000);
    return { snoozedUntil: until, dismissedAt: null, expiresAt: until };
  }
  const dated = key.match(/(\d{4}-\d{2}-\d{2})$/)?.[1];
  const expiresAt = dated ? new Date(`${addDays(dated, 30)}T00:00:00Z`) : new Date(now.getTime() + 180 * 86_400_000);
  return { snoozedUntil: null, dismissedAt: now, expiresAt: expiresAt < now ? new Date(now.getTime() + 86_400_000) : expiresAt };
}
