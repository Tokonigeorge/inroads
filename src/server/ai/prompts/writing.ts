import { z } from "zod";

/* ---------------- draft ---------------- */

export const DRAFT_VERSION = "draft@1";
export const draftPurposes = ["checkin", "birthday", "followup", "thanks"] as const;
export type DraftPurpose = (typeof draftPurposes)[number];
const purposeText: Record<DraftPurpose, string> = { checkin: "check-in message", birthday: "birthday message", followup: "follow-up after we met", thanks: "thank-you note" };

export function draftPrompt(c: { purpose: DraftPurpose; name: string; today: string; person: string; angles: string[]; me: string; space: string }) {
  return `Write a short ${purposeText[c.purpose]} I can send by WhatsApp or text to ${c.name}. Today is ${c.today}.
2-4 sentences. Warm, natural and specific to what we've actually discussed; end with an easy question or a light next step. No subject line, no sign-off, no hashtags, no placeholders in brackets. ${c.space === "work" ? "Mention my goals only if it fits naturally; never sound like a sales pitch." : "This is a personal relationship: don't mention work goals."}
Reply with only the message text.

ABOUT THEM:
${c.person}
${c.angles.length ? `Possible angles: ${c.angles.slice(0, 3).join("; ")}` : ""}

ABOUT ME:
${c.me}`;
}

/* ---------------- briefs ---------------- */

export const BRIEF_VERSION = "brief@2";

export function dailyBriefPrompt(c: { date: string; me: string; agenda: unknown; nudges: unknown; news: string[] }) {
  const news = c.news.length
    ? `\nYou may run up to 2 web searches for news from the last 30 days about: ${c.news.join(", ")}. Add a "## Fresh news" section only if you find something real, linking each item as [title](url).`
    : "";
  return `Write my morning networking brief for ${c.date}. Practical and short: markdown headings (##) and bullets, no greeting, no filler, under 280 words.
Sections: "## Today's rooms" (each meeting: who, the one thing to remember, the best opener, any promise I owe), "## Relationships to touch today" (max 3, with why), "## One move for my goals".
Use only the data below and what you find, and never invent facts. If there are no meetings, say so in one line and focus on the other sections.${news}

ABOUT ME:
${c.me}

TODAY'S AGENDA (JSON):
${JSON.stringify(c.agenda).slice(0, 30000)}

REMINDERS (JSON):
${JSON.stringify(c.nudges).slice(0, 12000)}`;
}

export function weeklyBriefPrompt(c: { from: string; to: string; me: string; rooms: unknown; cold: unknown; goals: unknown; openings: unknown; nudges: unknown }) {
  return `Write my weekly networking digest for the week of ${c.from} to ${c.to}. Strategic and short: markdown headings (##) and bullets, no greeting, under 300 words.
Sections: "## Rooms to be in", "## Relationships going cold" (who first and the angle for each), "## New openings", "## Goal progress" (honest read of where I'm behind), "## This week's three moves".
Use only the data below and never invent facts.

ABOUT ME:
${c.me}

ROOMS THIS WEEK (JSON): ${JSON.stringify(c.rooms).slice(0, 15000)}
GOING COLD (JSON): ${JSON.stringify(c.cold).slice(0, 15000)}
GOAL PROGRESS THIS WEEK (JSON): ${JSON.stringify(c.goals)}
NEW OPENINGS FROM RESEARCH (JSON): ${JSON.stringify(c.openings).slice(0, 8000)}
REMINDERS (JSON): ${JSON.stringify(c.nudges).slice(0, 8000)}`;
}

/* ---------------- scoring ---------------- */

export const SCORE_VERSION = "score@1";
export const scoreSchema = z.object({ scores: z.array(z.object({ id: z.string(), score: z.number(), why: z.string(), goalId: z.string() })) });

export function scorePrompt(c: { me: string; rows: string }) {
  return `Score how valuable each contact is to my CURRENT goals in this Space, 0-100: 80+ means act this week, 50-79 worth nurturing, under 50 low relevance right now. Use only the information given; don't assume facts about people you can't identify.

ABOUT ME:
${c.me}

CONTACTS (id | name | position | company | where we met | interests | notes | flag):
${c.rows}

Reply with JSON: {"scores":[{"id":"","score":0,"why":"15 words max","goalId":"id of the goal it serves, or empty"}]}, one entry per contact.`;
}

/* ---------------- chat import ---------------- */

export const CHAT_VERSION = "chat@3";
export const chatSchema = z.object({
  summary: z.string(),
  lastDate: z.string(),
  interactions: z.array(z.object({ date: z.string(), summary: z.string() })),
  commitments: z.array(z.object({ text: z.string(), owner: z.enum(["me", "them"]), due: z.string() })),
  // "family" as in the prototype (owner's call, decision #165); it comes back as a suggestion to accept.
  details: z.object({ company: z.string(), position: z.string(), interests: z.array(z.string()), birthday: z.string(), family: z.string().default(""), other: z.array(z.string()).default([]) }),
  sentiment: z.enum(["neutral", "warm", "cooling"]),
  nextStep: z.string(),
});
export type ChatExtract = z.infer<typeof chatSchema>;

export function chatPrompt(c: { me: string; other: string; today: string; transcript: string }) {
  return `Extract relationship intelligence from this conversation between me${c.me ? ` (shown as "${c.me}")` : ""} and ${c.other}. Today is ${c.today}.
Rules: at most 8 interactions, the most meaningful moments rather than every message; only commitments that are still open or recent; leave fields empty when the chat doesn't say; never guess. Don't record anything about their health, money or past relationships.

CONVERSATION (oldest to newest; may be trimmed to the most recent part):
"""
${c.transcript}
"""

Reply with JSON: {"summary":"2-3 sentences on the relationship and where things stand","lastDate":"YYYY-MM-DD of the last message","interactions":[{"date":"YYYY-MM-DD","summary":"one line"}],"commitments":[{"text":"what was promised","owner":"me|them","due":"YYYY-MM-DD or empty"}],"details":{"company":"","position":"","interests":[],"birthday":"MM-DD or empty","family":"what they shared about their family (partner, children, parents), or empty","other":["other useful details they mentioned about work, plans or preferences; up to 5"]},"sentiment":"warm|neutral|cooling","nextStep":"one suggested follow-up"}`;
}

/* ---------------- business card ---------------- */

export const CARD_VERSION = "card@1";
export const cardSchema = z.object({
  name: z.string(),
  position: z.string(),
  company: z.string(),
  email: z.string(),
  phone: z.string(),
  website: z.string(),
  linkedin: z.string(),
  x: z.string(),
  instagram: z.string(),
  notes: z.string(),
});
export type CardExtract = z.infer<typeof cardSchema>;
export const cardPrompt = `This photo is a business card. Extract the contact details exactly as printed. Use empty strings for anything not on the card. "notes": anything else useful printed on the card.`;
