/**
 * Today's reminders. A port of the prototype's buildNudges() with TECH_PLAN §4.5's changes:
 * "due" follows the reminder you set (person → circle → Space), not a score; promises run
 * both ways; imports waiting to be sorted get one small card a day. Pure: the repo loads a
 * snapshot, this decides what to show.
 */
import { addDays, diffDays, formatLongDate, weekday, type IsoDate } from "./dates";
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
  meetings: {
    person: NudgePerson;
    eventId: string;
    title: string;
    date: IsoDate;
    time: string | null;
    lastTouch: { on: IsoDate; summary: string } | null;
    promise: string | null;
    /** The room's Space, and whether they've been researched there (optional for older callers). */
    spaceId?: string;
    researched?: boolean;
  }[];
  /** Rooms (not 1:1 meetings) in the next 7 days, from tomorrow; `planned` when a look-up is attached. */
  rooms?: { eventId: string; spaceId: string; title: string; date: IsoDate; time: string | null; location: string | null; planned: boolean; going?: boolean }[];
  /** People added by hand in the last 14 days with no context yet. */
  needContext: (NudgePerson & { createdOn: IsoDate })[];
  /** Rooms (not 1:1 meetings) in the last 2 days you haven't said whether you went to. */
  afterRooms?: { eventId: string; title: string; date: IsoDate; occurrenceOn: IsoDate; people: number }[];
  triagePending: number;
  /** Possible duplicates from imports waiting for review. */
  duplicates?: number;
  /** AI suggestions (details found, goal fits, chat touches) waiting for a decision. */
  suggestions?: number;
  /** A new company or role research found since you saved theirs (refreshing priority people). */
  moves?: (NudgePerson & { field: "company" | "position"; value: string; was: string; foundOn: IsoDate })[];
  /** Keys snoozed or dismissed right now. */
  hidden: Set<string>;
};

export type NudgeKind = "moved" | "birthday" | "promise" | "owed_to_me" | "due" | "prep" | "context" | "room" | "after_room" | "triage" | "duplicates" | "suggestions";
export type NudgeAction =
  | { type: "promise_done"; commitmentId: string; label: string }
  | { type: "log_touch"; personId: string; label: string }
  | { type: "open_person"; personId: string; label: string }
  | { type: "edit_person"; personId: string; label: string }
  | { type: "open_room"; eventId: string; label: string }
  | { type: "debrief_room"; eventId: string; occurrenceOn: IsoDate; label: string }
  | { type: "sort"; label: string }
  | { type: "review_duplicates"; label: string }
  | { type: "review_suggestions"; label: string }
  | { type: "draft"; personId: string; purpose: "checkin" | "birthday" | "followup" | "congrats"; label: string }
  | { type: "research"; personId: string; spaceId: string; label: string }
  | { type: "decode_room"; eventId: string; spaceId: string; title: string; label: string }
  | { type: "going"; eventId: string; label: string }
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
/** "Going cold" cards a day, most overdue first. */
export const MAX_GOING_COLD = 5;
/** Meetings with more people you know than this are all-hands or webinars: no prep card. */
export const MAX_PREP_PEOPLE = 10;
/** In touch within this many days: no prep card for them. */
export const RECENT_DAYS = 7;
/** Calendar blocks that aren't meetings with people. */
const NOT_A_MEETING = /\b(out of office|ooo|focus( time)?|busy|blocked|block|lunch|holiday|annual leave|leave|vacation|travel|commute|gym)\b/i;
/** Starts the why-text of a "they've moved" suggestion, so Today can pick it out. */
export const MOVED_PREFIX = "New since you saved it:";
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

  // Mesh-style job changes: one card per person, while the news is fresh.
  const moved = new Set<string>();
  for (const m of s.moves ?? []) {
    if (moved.has(m.id) || diffDays(m.foundOn, t) > 14) continue;
    moved.add(m.id);
    out.push({
      key: `moved:${m.id}:${m.value}`,
      kind: "moved",
      priority: 2,
      label: "New role",
      title: m.field === "company" ? `${m.name} is now at ${m.value}` : `${m.name} is now ${m.value}`,
      body: `Research found this (you have ${m.was}). A quick congratulations is the easiest reason to get back in touch.`,
      person: who(m),
      actions: [
        { type: "draft", personId: m.id, purpose: "congrats", label: "Congratulate" },
        { type: "open_person", personId: m.id, label: "Update details" },
        { type: "dismiss", label: "Not now" },
      ],
    });
  }

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
        { type: "draft", personId: p.id, purpose: "birthday", label: "Draft a note" },
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
        { type: "draft", personId: c.person.id, purpose: "followup", label: "Draft a nudge" },
        { type: "snooze", days: 7, label: "Snooze a week" },
      ],
    });
  }

  // One card per meeting (not per person), for meetings with a few people you know. All-day
  // blocks, out-of-office and focus time, and big meetings (all-hands, webinars) get none.
  const sessions = new Map<string, NudgeSnapshot["meetings"]>();
  for (const m of s.meetings) {
    const n = diffDays(t, m.date);
    if (n < 0 || n > 3 || !m.time || NOT_A_MEETING.test(m.title)) continue;
    // Someone you've been in touch with this past week (a teammate at a standing meeting) needs no prep.
    if (m.lastTouch && diffDays(m.lastTouch.on, t) <= RECENT_DAYS) continue;
    const k = `${m.eventId}:${m.date}`;
    sessions.set(k, [...(sessions.get(k) ?? []), m]);
  }
  for (const [k, people] of sessions) {
    if (people.length > MAX_PREP_PEOPLE) continue;
    const m = people[0];
    const when = `${relativeDay(m.date, t)} at ${formatTime(m.time!)}`;
    const names = people.map((p) => firstName(p.person.name));
    const toResearch = people.find((p) => p.spaceId && p.researched === false);
    if (people.length === 1) {
      const bits = [m.lastTouch ? `Last spoke ${formatLongDate(m.lastTouch.on, t)}${m.lastTouch.summary ? `: ${m.lastTouch.summary}` : ""}.` : "You haven't logged a touch with them yet."];
      if (m.promise) bits.push(`You owe them: ${lowerFirst(m.promise)}.`);
      out.push({
        key: `prep:${k}`,
        kind: "prep",
        priority: 1,
        label: "Prep",
        title: `You meet ${names[0]} ${when}: ${m.title}`,
        body: bits.join(" "),
        person: who(m.person),
        actions: [
          ...(toResearch ? [{ type: "research" as const, personId: m.person.id, spaceId: toResearch.spaceId!, label: "Research now" }] : []),
          { type: "open_person", personId: m.person.id, label: "Open" },
          { type: "open_room", eventId: m.eventId, label: "See the room" },
        ],
      });
      continue;
    }
    const list = names.length > 3 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} others` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    const owe = people.filter((p) => p.promise).map((p) => `${firstName(p.person.name)}: ${lowerFirst(p.promise!)}`);
    const never = people.filter((p) => !p.lastTouch).length;
    out.push({
      key: `prep:${k}`,
      kind: "prep",
      priority: 1,
      label: "Prep",
      title: `You meet ${list} ${when}: ${m.title}`,
      body: [
        never === people.length ? "You haven't logged a touch with any of them yet." : never ? `${never} of them ${never === 1 ? "has" : "have"} no touch logged yet.` : "You've spoken with all of them before.",
        owe.length ? `You owe ${owe.join("; ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      person: null,
      actions: [
        ...(toResearch ? [{ type: "research" as const, personId: toResearch.person.id, spaceId: toResearch.spaceId!, label: `Research ${firstName(toResearch.person.name)}` }] : []),
        { type: "open_room", eventId: m.eventId, label: "See who's there" },
      ],
    });
  }

  // The prototype's "Going cold" card (L831–833): the most overdue few, so they don't crowd the rest.
  for (const p of s.due.slice(0, MAX_GOING_COLD)) {
    const days = p.lastTouchedOn ? diffDays(p.lastTouchedOn, t) : null;
    out.push({
      key: `due:${p.id}:${p.dueOn}`,
      kind: "due",
      priority: 2,
      label: "Going cold",
      title: days !== null ? `${days} days since you spoke with ${firstName(p.name)}` : `You haven't spoken with ${firstName(p.name)} yet`,
      body: `${p.detail ? `${p.detail}. ` : ""}For someone this important you aim to touch base every ${p.cadenceDays} days.`,
      person: who(p),
      actions: [
        { type: "draft", personId: p.id, purpose: "checkin", label: "Draft message" },
        { type: "log_touch", personId: p.id, label: "Log a touch" },
        { type: "snooze", days: 14, label: "Snooze" },
      ],
    });
  }

  // Rooms this week (prototype "This week", L843–846): decode the room, or open its plan.
  for (const r of s.rooms ?? []) {
    const n = diffDays(t, r.date);
    if (n < 1 || n > 7) continue;
    // Saved but not confirmed: ask first; the plan, research and "how did it go?" follow a yes.
    if (r.going === false) {
      out.push({
        key: `ev:${r.eventId}:${r.date}`,
        kind: "room",
        priority: 3,
        label: "This week",
        title: `Going to ${r.title}?`,
        body: [formatLongDate(r.date, t), r.time ? formatTime(r.time) : null, r.location].filter(Boolean).join(" · "),
        person: null,
        actions: [
          { type: "going", eventId: r.eventId, label: "I'm going" },
          { type: "open_room", eventId: r.eventId, label: "Open" },
        ],
      });
      continue;
    }
    out.push({
      key: `ev:${r.eventId}:${r.date}`,
      kind: "room",
      priority: 3,
      label: "This week",
      title: r.title,
      body: [formatLongDate(r.date, t), r.time ? formatTime(r.time) : null, r.location].filter(Boolean).join(" · "),
      person: null,
      actions: [
        r.planned
          ? { type: "open_room", eventId: r.eventId, label: "See the plan" }
          : { type: "decode_room", eventId: r.eventId, spaceId: r.spaceId, title: r.title, label: "Decode the room" },
        { type: "open_room", eventId: r.eventId, label: "Open" },
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

  if ((s.suggestions ?? 0) > 0) {
    const n = s.suggestions!;
    out.push({
      key: `sugg:${t}`,
      kind: "suggestions",
      priority: 4,
      label: "Review",
      title: `${n} ${n === 1 ? "suggestion" : "suggestions"} to review`,
      body: "Details research found, people who fit your goals, and touches from chats. Nothing changes until you accept.",
      person: null,
      actions: [
        { type: "review_suggestions", label: "Review" },
        { type: "dismiss", label: "Not today" },
      ],
    });
  }

  // The morning after a room (Loop A, step 3): confirm who you met while it's fresh.
  for (const r of s.afterRooms ?? []) {
    const ago = diffDays(r.date, t);
    if (ago < 1 || ago > 2) continue;
    out.push({
      key: `after:${r.eventId}:${r.occurrenceOn}`,
      kind: "after_room",
      priority: 1,
      label: "After the room",
      title: `Who did you meet at ${r.title}?`,
      body: `${ago === 1 ? "Yesterday" : formatLongDate(r.date, t)}. Confirm who you met and Inroads lines up the follow-ups${r.people ? `; ${r.people === 1 ? "1 person is" : `${r.people} people are`} already linked to it` : ""}.`,
      person: null,
      actions: [
        { type: "debrief_room", eventId: r.eventId, occurrenceOn: r.occurrenceOn, label: "Who I met" },
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
  // Every card can be cleared in one tap ("Done"), whatever else it offers.
  for (const n of out) {
    if (!n.actions.some((a) => a.type === "dismiss" || a.type === "promise_done")) n.actions.push({ type: "dismiss", label: "Done" });
  }
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
