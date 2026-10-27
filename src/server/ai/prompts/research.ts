import { z } from "zod";

const source = z.object({ title: z.string(), url: z.string() });
const sources = z.array(source);

/* ---------------- full research (Work Spaces) ---------------- */

export const RESEARCH_FULL_VERSION = "research.full@2";

export const researchFullSchema = z.object({
  identity: z.string(),
  matched: z.array(z.string()),
  conflicts: z.array(z.string()),
  summary: z.string(),
  career: z.array(z.string()),
  company: z.string(),
  signals: z.array(z.string()),
  sharedInterests: z.array(z.string()),
  talkingPoints: z.array(z.string()),
  opportunities: z.array(z.string()),
  profiles: z.object({ linkedin: z.string(), x: z.string(), instagram: z.string(), github: z.string(), substack: z.string(), website: z.string() }),
  found: z.object({ position: z.string(), company: z.string(), city: z.string(), birthday: z.string() }),
  score: z.number(),
  scoreWhy: z.string(),
  goalId: z.string(),
  confidence: z.enum(["medium", "high", "low"]),
  caveats: z.string(),
  sources,
});
export type ResearchFull = z.infer<typeof researchFullSchema>;

export function researchFullPrompt(c: { today: string; web: string; identity: string; me: string; person: string; pasted?: string }) {
  return `You are a relationship-intelligence researcher preparing a pre-meeting dossier on one person. Today is ${c.today}.
${c.web}
${c.identity}

ABOUT ME:
${c.me}

CONTACT (everything I've saved in this Space):
${c.person}
${c.pasted ? `\nMATERIAL I PASTED ABOUT THEM:\n"""\n${c.pasted.slice(0, 12000)}\n"""` : ""}

Reply with only this JSON:
{"identity":"who you believe this is and how sure you are, in one sentence","matched":["saved details the sources confirmed, e.g. 'the saved X handle links to the same LinkedIn'"],"conflicts":["saved details the sources contradict, e.g. 'saved company is Meridian but LinkedIn now says Airtel'"],"summary":"2-3 sentences: who they are and why they matter to me","career":["role, organisation (years if known)"],"company":"one line on what their organisation does","signals":["recent milestones, news, talks or posts, with month and year"],"sharedInterests":["common ground between us"],"talkingPoints":["5 specific openers or questions"],"opportunities":["concrete ways we could work together, tied to my goals"],"profiles":{"linkedin":"","x":"","instagram":"","github":"","substack":"","website":""},"found":{"position":"current title","company":"current organisation","city":"","birthday":"MM-DD, only if a source states it"},"score":0,"scoreWhy":"one sentence on fit with my goals","goalId":"the id of my best-matching goal from the list above, or empty","confidence":"high|medium|low","caveats":"what to verify","sources":[{"title":"","url":""}]}`;
}

/* ---------------- get to know (Personal, Dating and Other Spaces) ---------------- */

export const GET_TO_KNOW_VERSION = "research.get_to_know@1";

/**
 * Conversation material only (brief §4.0). The schema has no fields for family, home, past
 * relationships, money or other people's posts, so they can't come back even if found.
 */
const starter = z.object({ text: z.string(), url: z.string() });
export const getToKnowSchema = z.object({
  identity: z.string(),
  sharedInterests: z.array(starter),
  thingsToAsk: z.array(starter),
  funFacts: z.array(starter),
  confidence: z.enum(["medium", "high", "low"]),
  caveats: z.string(),
  sources,
});
export type GetToKnow = z.infer<typeof getToKnowSchema>;

export function getToKnowPrompt(c: { today: string; me: string; person: string; space: string }) {
  return `Help me get to know someone I've met, so I have good things to talk about. This is my ${c.space} life, not work. Today is ${c.today}.
You have web_search and web_fetch. Open their saved profile links first. Search only with their saved handles and links, or their name together with what I've saved (city, where we met), so you stay on the right person. Use only what they have published about themselves: their own posts, bios and pages.
Never include, even if you find it: family members or children, their home address or area, past relationships, money or finances, health, old or deleted posts, or what other people have written about them (news, comments, tags). If you can't confirm it's the same person, say so in "identity" and return empty lists.

ABOUT ME:
${c.me}

THEM (what I've saved):
${c.person}

Reply with only this JSON (each item one short line, with the page it came from):
{"identity":"who you believe this is and how sure you are","sharedInterests":[{"text":"","url":""}],"thingsToAsk":[{"text":"a warm, specific question","url":""}],"funFacts":[{"text":"","url":""}],"confidence":"high|medium|low","caveats":"what to double-check","sources":[{"title":"","url":""}]}`;
}

/* ---------------- verify (Personal, Dating and Other Spaces) ---------------- */

export const VERIFY_VERSION = "research.verify@1";

export const verifySchema = z.object({
  answer: z.enum(["unclear", "yes", "no"]),
  summary: z.string(),
  redFlags: z.array(z.string()),
  sources,
});
export type Verify = z.infer<typeof verifySchema>;

export function verifyPrompt(c: { today: string; person: string }) {
  return `Help me check that someone I'm talking to is who they say they are. Today is ${c.today}.
You have web_search and web_fetch. Answer only: does the profile they gave me exist, does their name or photo appear elsewhere under a different identity, and are there public safety red flags (scam reports, fake-profile warnings, impersonation). Nothing else: no background, family, relationships, money or address.

WHAT THEY TOLD ME / WHAT I'VE SAVED:
${c.person}

Reply with only this JSON:
{"answer":"yes (they check out) | no (something is wrong) | unclear","summary":"2-3 sentences on what you checked and found","redFlags":["each public red flag, with what it is"],"sources":[{"title":"","url":""}]}`;
}
