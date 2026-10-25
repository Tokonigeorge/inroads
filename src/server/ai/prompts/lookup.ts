import { z } from "zod";

export const LOOKUP_VERSION = "lookup@3";
export const lookupTypes = ["person", "company", "place", "event"] as const;
export type LookupType = (typeof lookupTypes)[number];

export const lookupSchema = z.object({
  title: z.string(),
  kind: z.string(),
  overview: z.string(),
  facts: z.array(z.string()),
  website: z.string(),
  stakeholders: z.array(z.object({ name: z.string(), role: z.string(), why: z.string(), url: z.string() })),
  warmPaths: z.array(z.object({ contactId: z.string(), how: z.string(), angle: z.string() })),
  opportunities: z.array(z.object({ goal: z.string(), idea: z.string(), firstMove: z.string() })),
  playbook: z.array(z.string()),
  /** For an event: when and where, to fill in a room. Empty strings when unknown. */
  when: z.object({ startsOn: z.string(), endsOn: z.string(), startTime: z.string(), endTime: z.string(), timezone: z.string(), venue: z.string(), url: z.string() }),
  confidence: z.enum(["medium", "high", "low"]),
  verify: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
});
export type Lookup = z.infer<typeof lookupSchema>;

const what: Record<LookupType, string> = {
  event: "the official event page, organisers, speakers, dates, venue and sponsors",
  person: "their saved social profiles and handles, their current role and organisation, LinkedIn, recent news, talks and posts",
  company: "the official site, leadership team, what they do, recent news, and who runs partnerships",
  place: "the official site, who runs it, what happens there, and who goes",
};
export const lookupWhat = (t: LookupType) => what[t];

export function lookupPrompt(c: { type: LookupType; q: string; today: string; web: string; known: string; context: string; me: string; network: string; identity: string }) {
  return `You map the landscape around a ${c.type} so I can walk in knowing who matters and how to get introduced. Today is ${c.today}.
${c.web}
When you don't find real names, give the roles to look for (e.g. "Head of partnerships") with an empty name.

TARGET (${c.type}): ${c.q}
${c.known ? `WHAT I'VE ALREADY SAVED ABOUT THIS (treat it as confirmed, use every detail to find the right ${c.type}, open any saved links first, and build on it rather than repeat it):\n${c.known}\n${c.type === "person" ? `${c.identity}\n` : ""}` : ""}${c.context ? `CONTEXT I PASTED:\n"""\n${c.context.slice(0, 12000)}\n"""\n` : ""}
ABOUT ME:
${c.me}

MY NETWORK IN THIS SPACE (id | name | position | company | where we met | tags | interests):
${c.network || "(empty)"}

Reply with only this JSON:
{"title":"the entity's proper name","kind":"person|company|venue|hub|city|event","overview":"2-3 sentences","facts":["dates, venue, size, location, founding, leadership: only what you found or know reliably"],"website":"official URL or empty","stakeholders":[{"name":"","role":"","why":"why they matter to me","url":"their profile or bio page, or empty"}],"warmPaths":[{"contactId":"an id from MY NETWORK","how":"how they connect: works there, met there, same sector or affiliation","angle":"what to ask them for"}],"opportunities":[{"goal":"my goal it serves","idea":"specific opportunity","firstMove":"concrete next step"}],"playbook":["3-5 tips for working this room or approaching this person"],"when":{"startsOn":"YYYY-MM-DD","endsOn":"YYYY-MM-DD or empty","startTime":"HH:MM 24h local or empty","endTime":"HH:MM or empty","timezone":"IANA zone of the venue, e.g. Africa/Lagos, or empty","venue":"venue and city, or Online","url":"the official event or ticket page"},"confidence":"high|medium|low","verify":"what to double-check","sources":[{"title":"","url":""}]}
Only use contactIds that appear in MY NETWORK. Up to 6 stakeholders.
${c.type === "event" ? "For \"when\": the next edition on or after today, taken from a page you opened. Leave a field empty rather than guess.\nFor an event, \"facts\" covers (as found): ticket price and how to register or apply, expected size and who typically attends, headline speakers and sponsors, the agenda themes or tracks, and any side events or investor sessions. Up to 8, each one short." : "Leave every \"when\" field empty."}
Each opening's "firstMove" is one concrete thing I can do this week, under 120 characters, starting with a verb.`;
}
