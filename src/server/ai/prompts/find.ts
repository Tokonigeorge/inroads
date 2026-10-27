import { z } from "zod";

export const FIND_VERSION = "find@1";

export const findSchema = z.object({
  people: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      organisation: z.string(),
      why: z.string(),
      url: z.string(),
    }),
  ),
  caveats: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
});
export type Found = z.infer<typeof findSchema>;

/**
 * A research step ("Find event planners who hire photographers"): real, named people or firms
 * near me who fit, so I can add them to the goal. Names only from pages found, never made up.
 */
export function findPrompt(c: { step: string; goal: string; today: string; web: string; me: string; network: string }) {
  return `I'm working on a goal and one of my next steps is to find the right people. Find real, named people (or, when a person can't be found, the firm itself) who fit this step, near where I'm based. Today is ${c.today}.
${c.web}
Prefer a named person with their role at a named organisation. Only include people or firms you found on a page you opened or know reliably exist; never invent names, titles or links. Leave out anyone already in MY NETWORK.

STEP: ${c.step}
GOAL IT SERVES: ${c.goal}

ABOUT ME (where I'm based is where to look first):
${c.me}

ALREADY IN MY NETWORK (names to leave out):
${c.network || "(none)"}

Reply with only this JSON:
{"people":[{"name":"the person's full name, or the firm's name when no person was found","role":"their role, or 'Firm' for an organisation","organisation":"where they work, or empty for a firm","why":"one sentence on why they fit this step and my goal","url":"their profile, bio or the firm's page, or empty"}],"caveats":"what to double-check","sources":[{"title":"","url":""}]}
Up to 8, best fit first.`;
}
