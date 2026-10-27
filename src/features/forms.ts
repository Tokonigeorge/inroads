import type { z } from "zod";
import { friendlyIssue } from "@/contracts/issues";

/** What a form's server action returns to useActionState. */
export type FormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Changes on each successful save so the form can show "Saved". */
  savedAt?: number;
  /** The record a save created, when the form should take you to it. */
  id?: string;
};

export const initialFormState: FormState = {};

/** First error per top-level field, for showing under each input, in plain words. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= friendlyIssue(issue);
  }
  return out;
}
