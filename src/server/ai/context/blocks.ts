import "server-only";
import { eq } from "drizzle-orm";
import { goalTypeLabels, goalPriorityLabels, type GoalType } from "@/contracts/goals";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import type { PersonContext, SpaceContext } from "./space-context";

/**
 * Prompt text blocks, ported from the prototype's meBlock() / contactBlock(). They only ever
 * format what the Space-scoped loaders return.
 */

export type Me = { name: string; headline: string | null; location: string | null; background: string | null; offerings: string | null; industries: string[]; timezone: string };

export async function loadMe(tx: Tx, userId: string): Promise<Me> {
  const [p] = await tx.select().from(t.profiles).where(eq(t.profiles.userId, userId));
  return { name: p?.name ?? "", headline: p?.headline ?? null, location: p?.location ?? null, background: p?.background ?? null, offerings: p?.offerings ?? null, industries: p?.industries ?? [], timezone: p?.timezone ?? "Africa/Lagos" };
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
    `This is my "${space.space.name}" Space.`,
    `Goals in this Space:\n${goals}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const FREEMAIL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|aol|proton|protonmail)\./i;

export function personBlock(p: PersonContext, opts: { history?: boolean } = {}) {
  const id = p.identity;
  const r = p.relationship;
  const dom = id.emails[0]?.split("@")[1] ?? "";
  const socials = Object.entries(id.socials ?? {}).filter(([, v]) => v);
  return [
    `Name: ${id.name}`,
    id.position && `Position: ${id.position}`,
    id.company && `Company: ${id.company}`,
    id.city && `Based in: ${id.city}`,
    id.emails.length && `Email: ${id.emails.join(", ")}${dom && !FREEMAIL.test(dom) ? ` (work domain: ${dom})` : ""}`,
    id.phones.length && `Phone: ${id.phones[0]}`,
    id.birthday && `Birthday: ${id.birthday}`,
    socials.length && `Social profiles and handles:\n${socials.map(([k, v]) => `- ${k}: ${v}`).join("\n")}`,
    r.whereMet && `Where we met: ${r.whereMet}${r.metOn ? ` (${r.metOn})` : ""}`,
    r.tags.length && `My tags for them: ${r.tags.join(", ")}`,
    r.interests.length && `Interests: ${r.interests.join(", ")}`,
    r.opportunities && `Opportunities I noted: ${r.opportunities}`,
    r.notes && `My notes: ${r.notes}`,
    p.goals.length && `On my goals: ${p.goals.map((g) => `${g.goal} (stage: ${g.stage})`).join("; ")}`,
    r.starred && "Priority relationship: yes",
    `Last contact: ${id.lastTouchedOn ?? "never logged"}`,
    p.touches.length && `Recent interactions:\n${p.touches.map((i) => `- ${i.date} ${i.type}: ${i.summary ?? ""}`).join("\n")}`,
    p.promises.length && `Open promises:\n${p.promises.map((c) => `- ${c.owner === "them" ? "They owe me" : "I owe them"}: ${c.text}${c.due ? ` (due ${c.due})` : ""}`).join("\n")}`,
    opts.history && p.research && p.research.mode !== "example" && `Earlier research (${p.research.createdAt.toISOString().slice(0, 10)}): ${String((p.research.payload as { summary?: string }).summary ?? "")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function webRules(web: boolean, what: string) {
  if (web) {
    return `LIVE WEB: you have web_search and web_fetch tools. Use them before answering: run 2-4 targeted searches (${what}), then open the 1-3 most relevant pages. Base facts on what you found and list every page you relied on in "sources" as {"title","url"}. If results describe a different person or organisation with the same name, say so instead of merging them. Never state facts the pages don't support.`;
  }
  return `NO WEB ACCESS in this run: use only what you reliably know plus the material below, set "sources" to [], and never invent specific facts (dates, deals, titles, numbers). Say what to verify in "caveats".`;
}

export function identityRules() {
  return `USE EVERYTHING I'VE SAVED: the profile is what I know for sure about this person. Use all of it (role, company, city, emails, birthday, social profiles and handles, tags, notes, interactions and earlier research) to find and confirm the right person, and build on it rather than repeat it. Open every saved profile link first with web_fetch, and use each saved handle as a search term (for example "@handle" or the handle with their name). Search their name together with their company, role, city, work email domain, tags and where we met. Don't put their phone number, personal email address or birthday into search queries; use those only to confirm a match when they appear on a page. Say which saved details the sources confirmed and which they contradict.`;
}

export const cell = (x: unknown) =>
  String(x ?? "")
    .replace(/[|\n]/g, "/")
    .slice(0, 120);
