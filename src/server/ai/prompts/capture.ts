import { z } from "zod";
import { touchTypes } from "@/contracts/people";

export const CAPTURE_VERSION = "capture@1";

/** Model output: the same shape as the rules parser, with empty strings for "not said". */
export const captureSchema = z.object({
  name: z.string(),
  company: z.string(),
  position: z.string(),
  touched: z.boolean(),
  touchType: z.enum(touchTypes),
  touchDate: z.string(),
  promises: z.array(
    z.object({
      text: z.string(),
      owner: z.enum(["me", "them"]),
      due: z.string(),
    }),
  ),
  followUpDate: z.string(),
});

export function capturePrompt(c: { line: string; today: string; weekday: string }) {
  return `I jotted down one line after meeting or talking to someone. Read it into structured fields. Today is ${c.weekday} ${c.today}.
Rules:
- name: the one person it's about, as written (keep their surname if given). Empty if no person is named.
- company and position: only if the line says them ("partnerships @ Paystack" is position "Partnerships", company "Paystack").
- touched: true if I met, called, messaged or emailed them. touchType is how (coffee, call, meeting, message, email, event, other; use "event" when we met at an event). touchDate is when, as YYYY-MM-DD (today if not said; "yesterday" is the day before).
- promises: things still to do. owner "me" when I owe it (including "she wants our deck" or "wants an intro to Tola": I owe the deck or intro), "them" when they owe me. Short imperative text, e.g. "Send the deck", "Intro to Tola". due is YYYY-MM-DD or empty.
- followUpDate: when I said to follow up or check in, as YYYY-MM-DD, or empty.
- Never invent anything the line doesn't say. Weekdays mean the next one coming for promises and follow-ups, and the last one for touches.

THE LINE:
${c.line}`;
}
