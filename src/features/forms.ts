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

/** First error per top-level field, for showing under each input. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
