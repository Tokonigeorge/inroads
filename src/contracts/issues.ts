import type { z } from "zod";

/** Zod's own wording ("Too small: expected string to have >=1 characters") is for developers. */
const isDefaultMessage = (m: string) => /^(Too (big|small)|Invalid|Expected|Unrecognized)\b/.test(m);

/** An issue in plain words: our own messages as written, Zod's defaults translated. */
export function friendlyIssue(issue: z.core.$ZodIssue): string {
  if (!isDefaultMessage(issue.message)) return issue.message;
  const i = issue as { code: string; minimum?: number | bigint; maximum?: number | bigint; origin?: string };
  if (i.code === "too_small") return i.origin === "string" && Number(i.minimum) <= 1 ? "This can't be empty." : i.origin === "string" ? `Use at least ${i.minimum} characters.` : "That's too small.";
  if (i.code === "too_big") return i.origin === "string" ? `Keep it under ${i.maximum} characters.` : i.origin === "array" ? `That's too many (up to ${i.maximum}).` : "That's too big.";
  if (i.code === "invalid_format") return "That doesn't look right. Check it and try again.";
  return "Check this and try again.";
}

/** The first problem, in plain words, for a one-line error. */
export function firstIssue(error: z.ZodError, fallback = "Check the details."): string {
  const issue = error.issues[0];
  return issue ? friendlyIssue(issue) : fallback;
}
