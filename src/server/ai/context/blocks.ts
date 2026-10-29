import "server-only";
import { eq } from "drizzle-orm";
import { goalTypeLabels, goalPriorityLabels, type GoalType } from "@/contracts/goals";
import { socialLabels } from "@/contracts/people";
import { roomKindLabels, type RoomKind } from "@/contracts/rooms";
import { addDays, type IsoDate } from "@/domain/dates";
import { occurrences, recurrenceLabel, type Recurrence } from "@/domain/recurrence";
import { warmth, warmthBand } from "@/domain/relationship";
import { socialUrl } from "@/domain/socials";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { birthdayLabel, type WebMode } from "../prompts/shared";
import type { PersonContext, SpaceContext } from "./space-context";

/**
 * Prompt text blocks, ported from the prototype's meBlock() / contactBlock() / eventBlock().
 * They only ever format what the Space-scoped loaders return.
 */

export type Me = { name: string; headline: string | null; location: string | null; background: string | null; offerings: string | null; industries: string[]; aiNotes: string | null; timezone: string };

export async function loadMe(tx: Tx, userId: string): Promise<Me> {
  const [p] = await tx.select().from(t.profiles).where(eq(t.profiles.userId, userId));
  return { name: p?.name ?? "", headline: p?.headline ?? null, location: p?.location ?? null, background: p?.background ?? null, offerings: p?.offerings ?? null, industries: p?.industries ?? [], aiNotes: p?.aiNotes ?? null, timezone: p?.timezone ?? "Africa/Lagos" };
}

export function meBlock(me: Me, space: SpaceContext) {
  const goals = space.goals.length
    ? space.goals.map((g, i) => `${i + 1}. [id ${g.id}] [${goalPriorityLabels[g.priority as 1 | 2 | 3] ?? "Medium"} priority, ${goalTypeLabels[g.type as GoalType] ?? "Other"}] ${g.text}`).join("\n")
    : "(none set yet: keep advice general)";
  return [
    `Name: ${me.name || "(not set)"}`,
    me.headline && `Headline: ${me.headline}`,
    me.location && `Based in: ${me.location}`,
    me.background && `Background: ${me.background}`,
    me.offerings && `What I offer: ${me.offerings}`,
    me.industries.length && `Target industries: ${me.industries.join(", ")}`,
    me.aiNotes &&
      `My notes for you (preferences, not rules: follow them most of the time, but keep some variety, and when you suggest something outside them say it's a stretch and why): ${me.aiNotes}`,
    `This is my "${space.space.name}" Space.`,
    `Goals in this Space:\n${goals}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const FREEMAIL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|aol|proton|protonmail)\./i;
const label = (key: string) => socialLabels[key as keyof typeof socialLabels] ?? key;
const todayUtc = () => new Date().toISOString().slice(0, 10);

type ResearchPayload = { summary?: string; identity?: string; profiles?: Record<string, string>; talkingPoints?: unknown; thingsToAsk?: unknown; answeredFrom?: WebMode };
const payloadOf = (p: PersonContext) => (p.research?.payload ?? {}) as ResearchPayload;

/** The last-research line: what was found then, so a new run can build on it (prototype L1519). */
function earlierResearch(p: PersonContext) {
  const d = p.research;
  if (!d || d.mode === "example") return "";
  const r = payloadOf(p);
  if (!r.summary) return "";
  const from = r.answeredFrom === "knowledge" ? "from model knowledge only" : "from the web";
  const profiles = Object.values(r.profiles ?? {}).filter(Boolean);
  const sources = ((d.sources ?? []) as { url?: string }[]).map((s) => s.url).filter(Boolean).slice(0, 5);
  return `Earlier research (${d.createdAt.toISOString().slice(0, 10)}, ${from}): ${r.summary}${r.identity ? ` | Identity: ${r.identity}` : ""}${profiles.length ? ` | Profiles found then: ${profiles.join(", ")}` : ""}${sources.length ? ` | Sources then: ${sources.join(", ")}` : ""}`;
}

/** "Relationship: Warm, last contact 12 days ago": the warmth band the UI's ring uses. */
export function relationshipLine(lastTouchedOn: IsoDate | null | undefined, today: IsoDate) {
  const w = warmth(lastTouchedOn, today);
  return `Relationship: ${warmthBand[w.key]}${w.days != null ? `, last contact ${w.days} days ago` : ""}`;
}

export function personBlock(p: PersonContext, opts: { history?: boolean; today?: IsoDate } = {}) {
  const id = p.identity;
  const r = p.relationship;
  const [email, ...otherEmails] = id.emails;
  const dom = id.emails.map((e) => e.split("@")[1] ?? "").find((d) => d && !FREEMAIL.test(d)) ?? "";
  const socials = Object.entries(id.socials ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => {
      const url = socialUrl(k, v);
      return `- ${label(k)}: ${v}${url && url !== v ? ` (link: ${url})` : ""}`;
    });
  return [
    `Name: ${id.name}`,
    id.position && `Position: ${id.position}`,
    id.company && `Company: ${id.company}`,
    id.city && `Based in: ${id.city}`,
    email && `Email: ${email}${dom ? ` (work domain: ${dom})` : ""}`,
    otherEmails.length && `Other emails: ${otherEmails.join(", ")}`,
    id.phones.length && `Phone: ${id.phones[0]}`,
    id.birthday && `Birthday: ${birthdayLabel(id.birthday) || id.birthday}`,
    socials.length && `Social profiles and handles:\n${socials.join("\n")}`,
    r.whereMet && `Where we met: ${r.whereMet}${r.metOn ? ` (${r.metOn})` : ""}`,
    r.tags.length && `My tags for them: ${r.tags.join(", ")}`,
    r.interests.length && `Interests: ${r.interests.join(", ")}`,
    r.opportunities && `Opportunities I noted: ${r.opportunities}`,
    r.notes && `My notes: ${r.notes}`,
    p.goals.length && `On my goals: ${p.goals.map((g) => `${g.goal} (stage: ${g.stage})`).join("; ")}`,
    r.starred && "Priority relationship: yes",
    relationshipLine(id.lastTouchedOn, opts.today ?? todayUtc()),
    p.touches.length && `Recent interactions:\n${p.touches.map((i) => `- ${i.date} ${i.type}: ${i.summary ?? ""}`).join("\n")}`,
    p.promises.length && `Open promises:\n${p.promises.map((c) => `- ${c.owner === "them" ? "They owe me" : "I owe them"}: ${c.text}${c.due ? ` (due ${c.due})` : ""}`).join("\n")}`,
    opts.history && earlierResearch(p),
  ]
    .filter(Boolean)
    .join("\n");
}

/** The saved details a run could draw on, in plain words (prototype profileUsed(), L1522). Shown on the result. */
export function profileUsed(p: PersonContext): string[] {
  const id = p.identity;
  const r = p.relationship;
  const n = p.touches.length;
  return [
    id.position && "role",
    id.company && "company",
    id.city && "city",
    id.emails.length && "email",
    id.emails.length > 1 && "other emails",
    id.phones.length && "phone",
    id.birthday && "birthday",
    ...Object.entries(id.socials ?? {})
      .filter(([, v]) => v)
      .map(([k]) => label(k)),
    r.whereMet && "where you met",
    r.tags.length && "tags",
    r.interests.length && "interests",
    r.notes && "notes",
    n && `${n} interaction${n === 1 ? "" : "s"}`,
    p.research && p.research.mode !== "example" && "earlier research",
  ].filter((x): x is string => typeof x === "string" && x.length > 0);
}

/** Up to n talking points from the latest research (full research, or Get to know's questions). */
export function talkingPointsFrom(payload: unknown, n = 3): string[] {
  const p = (payload ?? {}) as { talkingPoints?: unknown; thingsToAsk?: unknown };
  const list = Array.isArray(p.talkingPoints) ? p.talkingPoints : Array.isArray(p.thingsToAsk) ? p.thingsToAsk : [];
  return list
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" && "text" in x ? String((x as { text: unknown }).text) : ""))
    .filter(Boolean)
    .slice(0, n);
}

/** "Partner · Kestrel", else an email or phone (prototype roleLine). */
export const roleLine = (p: PersonContext) => [p.identity.position, p.identity.company].filter(Boolean).join(" · ") || p.identity.emails[0] || p.identity.phones[0] || "No role added yet";

/** One person for a brief's JSON, in the prototype's person() shape (L1730). */
export function briefPerson(p: PersonContext) {
  const last = p.touches[0];
  const research = p.research && p.research.mode !== "example" ? p.research : null;
  return {
    name: p.identity.name,
    role: roleLine(p),
    lastInteraction: last ? { date: last.date, summary: last.summary ?? "" } : null,
    dossier: research ? String((research.payload as ResearchPayload).summary ?? "") : "",
    talkingPoints: research ? talkingPointsFrom(research.payload, 3) : [],
    openPromises: p.promises.map((c) => `${c.owner === "them" ? "they owe: " : "I owe: "}${c.text}`),
    interests: p.relationship.interests,
  };
}

export type EventForBlock = {
  title: string;
  kind: string;
  startsOn: IsoDate;
  startTime: string | null;
  recurrence: Recurrence;
  location: string | null;
  url: string | null;
  notes: string | null;
  people: { name: string; company: string | null }[];
};

/** A room on my list, as the prototype's eventBlock() (L1530) describes it. */
export function eventBlock(e: EventForBlock, today: IsoDate) {
  const next = occurrences({ ...e.recurrence, start: e.startsOn }, today, addDays(today, 400)).slice(0, 3);
  return [
    `Title: ${e.title}`,
    `Type: ${roomKindLabels[e.kind as RoomKind] ?? "Event"}`,
    `Repeats: ${recurrenceLabel(e.recurrence)}`,
    `First date: ${e.startsOn}${e.startTime ? ` ${e.startTime.slice(0, 5)}` : ""}`,
    next.length && `Next dates: ${next.join(", ")}`,
    e.location && `Location: ${e.location}`,
    e.url && `Event page: ${e.url}`,
    e.notes && `My notes: ${e.notes.slice(0, 2000)}`,
    e.people.length && `People from my network linked to it: ${e.people.map((c) => c.name + (c.company ? ` (${c.company})` : "")).join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function webRules(mode: WebMode, what: string) {
  if (mode === "web") {
    return `LIVE WEB: you have web_search and web_fetch tools. Use them before answering: run 2-4 targeted searches (${what}), then open the 1-3 most relevant pages. Base facts on what you found and list every page you relied on in "sources" as {"title","url"}. If results describe a different person or organisation with the same name, say so instead of merging them. Never state facts the pages don't support.`;
  }
  return `NO WEB ACCESS in this run: use only what you reliably know plus the material below, set "sources" to [], and never invent specific facts (dates, deals, titles, numbers). Say what to verify in "caveats".`;
}

export function identityRules(mode: WebMode = "web") {
  const how =
    mode === "web"
      ? ` Open every saved profile link first with web_fetch, and use each saved handle as a search term (for example "@handle" or the handle with their name). Search their name together with their company, role, city, work email domain, tags and where we met.`
      : "";
  return `USE EVERYTHING I'VE SAVED: the profile is what I know for sure about this person. Use all of it (role, company, city, emails, birthday, social profiles and handles, tags, notes, interactions and earlier research) to find and confirm the right person, and build on it rather than repeat it.${how} Don't put their phone number, personal email address or birthday into search queries; use those only to confirm a match when they appear on a page. Say which saved details the sources confirmed and which they contradict.`;
}

export const cell = (x: unknown) =>
  String(x ?? "")
    .replace(/[|\n]/g, "/")
    .slice(0, 120);
