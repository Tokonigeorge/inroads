import { z } from "zod";

export const RADAR_VERSION = "radar@1";

export const radarSchema = z.object({
  items: z.array(
    z.object({
      title: z.string(),
      kind: z.string(),
      date: z.string(),
      time: z.string(),
      timing: z.string(),
      where: z.string(),
      why: z.string(),
      who: z.string(),
      url: z.string(),
      howToFind: z.string(),
      confidence: z.enum(["idea", "confirmed", "recurring"]),
    }),
  ),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
});
export type Radar = z.infer<typeof radarSchema>;

export function radarPrompt(c: { today: string; horizon: string; me: string; city: string; gathers: string; mine: string }) {
  return `Find real networking events for me between ${c.today} and ${c.horizon}: conferences, meetups, mixers, dinners and community events in or near my city, or online, that serve my goals.
LIVE WEB: use web_search and web_fetch. Search event listings (Luma, Eventbrite, Meetup, organisers' sites, LinkedIn events, tech and business news event roundups) and open the listing pages to confirm dates.
Only mark an event "confirmed" when you saw its date on a page, and give that page's URL. Add at most one host-your-own idea at the end with confidence "idea".

ABOUT ME:
${c.me}
My city: ${c.city}

WHERE MY NETWORK ALREADY GATHERS: ${c.gathers || "(no data yet)"}
ROOMS ALREADY ON MY LIST: ${c.mine || "(none)"}

Reply with only this JSON, up to 8 items:
{"items":[{"title":"","kind":"conference|mixer|meetup|dinner|community|host-your-own","date":"YYYY-MM-DD or empty","time":"HH:MM or empty","timing":"human-readable when","where":"","why":"how it serves one of my goals","who":"who I'd meet there","url":"listing URL or empty","howToFind":"where to check the next date","confidence":"confirmed|recurring|idea"}],"sources":[{"title":"","url":""}]}`;
}
