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
