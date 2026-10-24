import { z } from "zod";
import { isIsoDate } from "@/domain/dates";
import { touchTypes } from "./people";

const isoOrNull = z
  .string()
  .nullable()
  .transform((s) => (s && isIsoDate(s) ? s : null));

/** A quick-capture line read into its parts. Shared by the rules parser, the model and the review form. */
export const quickDraftSchema = z.object({
  name: z.string().trim().max(120).nullable(),
  company: z.string().trim().max(120).nullable(),
  position: z.string().trim().max(120).nullable(),
  touch: z
    .object({
      type: z.enum(touchTypes),
      occurredOn: isoOrNull,
      summary: z.string().max(2000),
    })
    .nullable(),
  promises: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(300),
        owner: z.enum(["me", "them"]),
        dueOn: isoOrNull,
      }),
    )
    .max(5),
  followUpOn: isoOrNull,
});

export const quickReadSchema = z.object({
  line: z.string().trim().min(2, "Type what happened.").max(500, "Keep it to one line."),
  spaceId: z.string().uuid(),
});

export type QuickCandidate = { id: string; name: string; detail: string };
export type QuickReadResult = {
  draft: z.output<typeof quickDraftSchema>;
  source: "ai" | "rules";
  candidates: QuickCandidate[];
};
