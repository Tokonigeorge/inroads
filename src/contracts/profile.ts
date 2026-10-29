import { z } from "zod";
import { isValidTimeZone } from "@/domain/zoned";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((s) => s || null);

/** Settings → Profile. What you tell Inroads about yourself; AI features read it as context. */
export const profileSchema = z.object({
  name: z.string().trim().min(1, "Add your name.").max(80),
  headline: optionalText(120),
  location: optionalText(80),
  background: optionalText(2000),
  offerings: optionalText(1000),
  aiNotes: optionalText(1500).optional(),
  industries: z
    .string()
    .max(400)
    .transform((s) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))])
    .pipe(z.array(z.string().max(40, "Keep each industry short.")).max(10, "Up to 10 industries.")),
  timezone: z.string().refine(isValidTimeZone, "Choose a time zone."),
  region: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Choose a country."),
  briefTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time."),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/**
 * The prototype's "Profile & goals" sheet (L1155–1177): who you are and what you want from your
 * network, plus one row per goal. Time zone, phone region and brief time stay on the Account page.
 */
export const profileGoalsSchema = z.object({
  name: z.string().trim().min(1, "Add your name.").max(80),
  location: optionalText(80),
  headline: optionalText(120),
  background: optionalText(2000),
  offerings: optionalText(1000),
  aiNotes: optionalText(1500).optional(),
  industries: z
    .string()
    .max(400)
    .transform((s) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))])
    .pipe(z.array(z.string().max(40, "Keep each industry short.")).max(10, "Up to 10 industries.")),
  emails: z
    .string()
    .max(1000)
    .transform((s) => [...new Set(s.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))])
    .pipe(z.array(z.string().email("One of those isn't an email address.")).max(10, "Up to 10 addresses.")),
  goals: z
    .array(
      z.object({
        id: z.string().uuid().nullable(),
        text: z.string().trim().max(140, "Keep each goal under 140 characters."),
        type: z.string(),
        priority: z.coerce.number().int().min(1).max(3),
        weeklyTarget: z.coerce.number({ error: "Use a number." }).int("Use a whole number.").min(1, "At least 1 a week.").max(50, "At most 50 a week."),
        active: z.boolean(),
      }),
    )
    .max(20),
});

export type ProfileGoalsInput = z.input<typeof profileGoalsSchema>;
