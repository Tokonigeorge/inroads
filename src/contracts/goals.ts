import { z } from "zod";
import { isIsoDate } from "@/domain/dates";
import { stageDraftSchema, type SpaceKind } from "./spaces";

export const goalTypes = ["capital", "clients", "hiring", "market", "partners", "mentors", "career", "friends", "family", "dating", "other"] as const;
export type GoalType = (typeof goalTypes)[number];
export const goalTypeLabels: Record<GoalType, string> = {
  capital: "Raise capital",
  clients: "Win clients",
  hiring: "Hire people",
  market: "Enter a market",
  partners: "Find partners",
  mentors: "Find mentors",
  career: "Career move",
  friends: "Friendships",
  family: "Family",
  dating: "Dating",
  other: "Other",
};

/** Which goal types a form offers first for each kind of Space. All stay available. */
export const goalTypesFor: Record<SpaceKind, readonly GoalType[]> = {
  work: ["capital", "clients", "hiring", "market", "partners", "mentors", "career", "other"],
  personal: ["friends", "family", "mentors", "other"],
  dating: ["dating", "other"],
  custom: ["friends", "mentors", "partners", "other"],
};

export const goalPriorities = [1, 2, 3] as const;
export const goalPriorityLabels: Record<(typeof goalPriorities)[number], string> = { 1: "High", 2: "Medium", 3: "Low" };

export const goalSchema = z.object({
  text: z.string().trim().min(3, "Say what you're aiming for, e.g. \"Raise a pre-seed round\".").max(140, "Keep it under 140 characters."),
  spaceId: z.string().uuid("Choose a Space."),
  type: z.enum(goalTypes),
  priority: z.coerce.number().int().min(1).max(3),
  weeklyTarget: z.coerce.number({ error: "Use a number." }).int("Use a whole number.").min(1, "At least 1 a week.").max(50, "At most 50 a week."),
  dueOn: z
    .union([z.string().refine(isIsoDate, "Use a real date."), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  /** null = use the Space's stages. */
  stages: z
    .array(stageDraftSchema)
    .min(2, "A pipeline needs at least two stages.")
    .max(12, "Keep it to 12 stages or fewer.")
    .refine((st) => st.some((x) => !x.closed), "At least one stage must be open (not an end state).")
    .refine((st) => new Set(st.map((x) => x.label.toLowerCase())).size === st.length, "Two stages have the same name.")
    .nullable(),
});
export type GoalInput = z.input<typeof goalSchema>;

export const goalLinkSchema = z.object({
  goalId: z.string().uuid(),
  personIds: z.array(z.string().uuid()).min(1).max(200),
  stage: z.string().max(40).optional(),
});

export const moveStageSchema = z.object({ linkId: z.string().uuid(), stage: z.string().min(1).max(40) });
export const linkNoteSchema = z.object({ linkId: z.string().uuid(), note: z.string().trim().max(500, "Keep the note under 500 characters.") });
