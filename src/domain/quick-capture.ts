/**
 * Quick capture: one line ("Met Ada, partnerships @ Paystack, wants intro to Tola by Friday")
 * turned into a draft person, touch, promises and a follow-up date. Pure and rule-based, so it
 * works offline and costs nothing; the server may improve the draft with the fast model, and
 * the user always reviews it before anything is saved.
 */
import { addDays, diffDays, weekday, type IsoDate } from "./dates";

export type QuickTouchType = "coffee" | "call" | "meeting" | "message" | "email" | "event" | "other";
export type QuickDraft = {
  name: string | null;
  company: string | null;
  position: string | null;
  touch: { type: QuickTouchType; occurredOn: IsoDate; summary: string } | null;
  promises: { text: string; owner: "me" | "them"; dueOn: IsoDate | null }[];
  followUpOn: IsoDate | null;
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_RE = "(?:sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)(?:day)?";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";

const dayIndex = (word: string) => DAYS.findIndex((d) => d.startsWith(word.toLowerCase().slice(0, 3)));
const pad = (n: number) => String(n).padStart(2, "0");

/** The next date (today or later) falling on a weekday; `next` skips into the following week. */
function upcomingWeekday(today: IsoDate, day: number, next = false): IsoDate {
  const ahead = (day - weekday(today) + 7) % 7;
  let d = addDays(today, ahead);
  if (next) {
    // "next Friday" said on a Monday means the Friday after this one.
    const daysToSunday = (7 - weekday(today)) % 7;
    if (diffDays(today, d) <= daysToSunday) d = addDays(d, 7);
  }
  return d;
}

/** The most recent date (today or earlier) on a weekday, for when something happened. */
function pastWeekday(today: IsoDate, day: number): IsoDate {
  return addDays(today, -((weekday(today) - day + 7) % 7));
}

function explicitDate(text: string, today: IsoDate, direction: "past" | "future"): IsoDate | null {
  const year = Number(today.slice(0, 4));
  const build = (y: number, m: number, d: number) => {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? iso : null;
  };
  const roll = (m: number, d: number) => {
    const iso = build(year, m, d);
    if (!iso) return null;
    if (direction === "future" && iso < today) return build(year + 1, m, d);
    if (direction === "past" && iso > today) return build(year - 1, m, d);
    return iso;
  };
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (m) return build(+m[1], +m[2], +m[3]);
  m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\b`, "i").exec(text);
  if (m) return roll(MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)) + 1, +m[1]);
  m = new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i").exec(text);
  if (m) return roll(MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1, +m[2]);
  // Day first, as written in Nigeria and the UK: 28/10.
  m = /\b(\d{1,2})\/(\d{1,2})\b/.exec(text);
  if (m) return roll(+m[2], +m[1]);
  return null;
}

/** A date for something still to happen ("by Friday", "next week", "in 3 days"). */
export function futureDate(text: string, today: IsoDate): IsoDate | null {
  const t = text.toLowerCase();
  if (/\b(today|tonight)\b/.test(t)) return today;
  if (/\btomorrow\b/.test(t)) return addDays(today, 1);
  let m = /\bin\s+(\d{1,2}|a|one|two|three)\s+(day|week)s?\b/.exec(t);
  if (m) {
    const n = { a: 1, one: 1, two: 2, three: 3 }[m[1]] ?? Number(m[1]);
    return addDays(today, m[2] === "week" ? n * 7 : n);
  }
  if (/\bnext week\b/.test(t)) return upcomingWeekday(addDays(today, 1), 1, weekday(today) === 0);
  if (/\b(end of (the )?week|this weekend)\b/.test(t)) return upcomingWeekday(today, 5);
  m = new RegExp(`\\b(next\\s+)?(${DAY_RE})\\b`).exec(t);
  if (m) return upcomingWeekday(today, dayIndex(m[2]), Boolean(m[1]));
  return explicitDate(text, today, "future");
}

/** A date for something that already happened ("yesterday", "on Tuesday"). Defaults to today. */
function pastDate(text: string, today: IsoDate): IsoDate {
  const t = text.toLowerCase();
  if (/\byesterday\b/.test(t)) return addDays(today, -1);
  if (/\blast night\b/.test(t)) return addDays(today, -1);
  const m = new RegExp(`\\b(?:on|last)\\s+(${DAY_RE})\\b`).exec(t);
  if (m) return pastWeekday(today, dayIndex(m[1]));
  return explicitDate(text, today, "past") ?? today;
}

const NAME = "([A-Z][\\p{L}'’-]+(?:\\s+(?:[A-Z][\\p{L}'’-]+|de|da|van|von|bin|al)){0,3})";
const TOUCH_VERBS: [RegExp, QuickTouchType][] = [
  [/\b(?:coffee|lunch|dinner|drinks|breakfast)\s+with\b/i, "coffee"],
  [/\b(?:called|call(?:ed)? with|phoned|spoke (?:to|with)|rang|zoom(?:ed)? with)\b/i, "call"],
  [/\b(?:messaged|texted|whatsapp(?:ed)?|dm(?:'?d)?)\b/i, "message"],
  [/\b(?:emailed|e-mailed|mailed)\b/i, "email"],
  [/\b(?:met|meeting with|caught up with|saw|ran into|chatted with|talked (?:to|with)|had a chat with)\b/i, "meeting"],
];

const DUE_TAIL = new RegExp(
  `\\s*\\b(?:by|before|on|due|for|until)?\\s*(?:(?:next\\s+)?${DAY_RE}|today|tonight|tomorrow|next week|end of (?:the )?week|this weekend|in\\s+(?:\\d{1,2}|a|one|two|three)\\s+(?:days?|weeks?)|\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_RE}|${MONTH_RE}\\s+\\d{1,2}|\\d{1,2}/\\d{1,2}|\\d{4}-\\d{2}-\\d{2})\\.?\\s*$`,
  "i",
);

function clean(s: string) {
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .trim();
}

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** One promise from a clause, if the clause is one. */
function promiseFrom(clause: string, name: string | null, today: IsoDate): QuickDraft["promises"][number] | null {
  const dueOn = futureDate(clause, today);
  const body = (s: string) => capitalise(clean(s.replace(DUE_TAIL, "")));
  let m = /\b(?:wants|asked (?:me )?for|needs|would like|keen on)\s+(?:an?\s+)?intro(?:duction)?\s+to\s+(.+)/i.exec(clause);
  if (m)
    return {
      text: `Intro to ${clean(m[1].replace(DUE_TAIL, ""))}`,
      owner: "me",
      dueOn,
    };
  m = /\b(?:wants|asked (?:me )?for|needs|requested)\s+(.+)/i.exec(clause);
  if (m)
    return {
      text: body(`Send ${/^(the|my|our|a|an|some)\b/i.test(m[1]) ? "" : "the "}${m[1]}`),
      owner: "me",
      dueOn,
    };
  m = /\b(?:i'?ll|i will|i owe (?:(?:her|him|them)\s+)?|i need to|i must|i promised(?: to)?|i'?m going to|i have to|remember to|need to)\s+(.+)/i.exec(clause);
  if (m) return { text: body(m[1]), owner: "me", dueOn };
  const them = name ? name.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "\\b\\B";
  m = new RegExp(
    `\\b(?:she'?ll|he'?ll|they'?ll|she will|he will|they will|${them} will|${them}'ll|(?:she|he|they|${them}) (?:promised|offered|said she'?d|said he'?d|said they'?d)(?: to)?)\\s+(.+)`,
    "i",
  ).exec(clause);
  if (m) return { text: body(m[1]), owner: "them", dueOn };
  m = new RegExp(`\\b(?:she|he|they|${them}) owes? me\\s+(.+)`, "i").exec(clause);
  if (m) return { text: body(m[1]), owner: "them", dueOn };
  return null;
}

export function parseQuickCapture(line: string, today: IsoDate): QuickDraft {
  const text = line.replace(/\s+/g, " ").trim().slice(0, 500);
  const draft: QuickDraft = {
    name: null,
    company: null,
    position: null,
    touch: null,
    promises: [],
    followUpOn: null,
  };
  if (!text) return draft;
  const clauses = text
    .split(/\s*[,;]\s*|\s+(?:-|–|—)\s+|\.\s+/)
    .map((c) => c.trim())
    .filter(Boolean);

  // Who, and how you were in touch.
  const first = clauses[0] ?? "";
  for (const [re, type] of TOUCH_VERBS) {
    const m = re.exec(first);
    if (!m) continue;
    const after = first.slice(m.index + m[0].length);
    const n = new RegExp(`^\\s*${NAME}`, "u").exec(after);
    if (n) {
      draft.name = n[1];
      const at = /\bat\s+(?:the\s+)?(.+)$/i.exec(after.slice(n[0].length));
      const atEvent = at && /\b(mixer|meetup|summit|conference|week|breakfast|dinner|party|event|launch|demo day|hangout|session|workshop|panel)\b/i.test(at[1]);
      draft.touch = {
        type: atEvent ? "event" : type,
        occurredOn: pastDate(text, today),
        summary: text,
      };
    }
    break;
  }
  if (!draft.name) {
    const n = new RegExp(`^${NAME}`, "u").exec(first);
    if (n && !/^(I|I'll|I'm|Follow|Remind|Ping|Send|Call|Email|Message)\b/.test(n[1])) draft.name = n[1];
  }

  for (const clause of clauses) {
    // Role and company: "partnerships @ Paystack", "CTO at Kuda", "from Flutterwave".
    if (!draft.company) {
      const m = /^(?:(?:[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,3})\s+)?(?:(?:is|the|a|an)\s+)?([\p{L}&/ .-]{2,60}?)\s*(?:@|\bat\b)\s*([A-Z0-9][\p{L}\d&.' -]{1,60})$/u.exec(
        clause,
      );
      const from = /\bfrom\s+([A-Z][\p{L}\d&.' -]{1,60})$/u.exec(clause);
      if (m && !/\b(met|saw|coffee|lunch|dinner|mixer|meetup|event|summit|conference|breakfast|party)\b/i.test(m[1])) {
        const role = clean(m[1].replace(new RegExp(`^${draft.name ?? "\\b\\B"}\\s*`), ""));
        draft.position = role && !/^(works?|working)$/i.test(role) ? capitalise(role) : null;
        draft.company = clean(m[2]);
        continue;
      }
      if (from) {
        draft.company = clean(from[1]);
      }
    }
    // Follow-up: "follow up Monday", "ping her next week", "remind me in 3 days".
    if (/\b(follow[ -]?up|f\/u|ping (?:her|him|them)|remind me|check in|chase)\b/i.test(clause)) {
      const on = futureDate(clause, today);
      if (on) {
        draft.followUpOn = on;
        continue;
      }
    }
    const p = promiseFrom(clause, draft.name, today);
    if (p && p.text.length > 1 && !draft.promises.some((x) => x.text === p.text)) draft.promises.push(p);
  }
  draft.promises = draft.promises.slice(0, 5);
  return draft;
}
