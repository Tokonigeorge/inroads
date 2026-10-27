import type { z } from "zod";

/** What a form's server action returns to useActionState. */
export type FormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Changes on each successful save so the form can show "Saved". */
  savedAt?: number;
};

export const initialFormState: FormState = {};

/** Zod's own wording ("Too small: expected string to have >=1 characters") is for developers. */
const isDefaultMessage = (m: string) => /^(Too (big|small)|Invalid|Expected|Unrecognized)\b/.test(m);

function friendly(issue: z.core.$ZodIssue): string {
  if (!isDefaultMessage(issue.message)) return issue.message;
  const i = issue as { code: string; minimum?: number | bigint; maximum?: number | bigint; origin?: string };
  if (i.code === "too_small") return i.origin === "string" && Number(i.minimum) <= 1 ? "This can't be empty." : i.origin === "string" ? `Use at least ${i.minimum} characters.` : "That's too small.";
  if (i.code === "too_big") return i.origin === "string" ? `Keep it under ${i.maximum} characters.` : i.origin === "array" ? `That's too many (up to ${i.maximum}).` : "That's too big.";
  if (i.code === "invalid_format") return "That doesn't look right. Check it and try again.";
  return "Check this and try again.";
}

/** First error per top-level field, for showing under each input, in plain words. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= friendly(issue);
  }
  return out;
}
