import { z } from "zod";

export const ASK_VERSION = "ask@1";

export const askTermsSchema = z.object({ terms: z.array(z.string()) });

export function askTermsPrompt(question: string) {
  return `I'm searching my own contacts and notes. Turn my question into up to 10 short search terms that would appear in someone's details: their role, company, city, industry, interests or my notes. Include close synonyms and related words (for "raised before" include "raised", "funding", "seed", "series"; for "fintech" include "payments"). Single words or short phrases, lower case. No names unless I gave one.

MY QUESTION:
${question}`;
}

export const askRankSchema = z.object({ matches: z.array(z.object({ id: z.string(), why: z.string() })) });

export function askRankPrompt(c: { question: string; candidates: unknown }) {
  return `I asked a question about my own network. Below are people from it that might fit, with what I've recorded about them. Pick the ones that really answer my question, best first, at most 8. For each, give one short reason that cites what's recorded ("Partner at Kestrel; your notes say she led their seed round"). Use only the details below; never guess or add facts. If nobody fits, return an empty list.

MY QUESTION:
${c.question}

PEOPLE (JSON):
${JSON.stringify(c.candidates).slice(0, 40000)}`;
}
