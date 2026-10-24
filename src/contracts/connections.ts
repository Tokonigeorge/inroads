import { z } from "zod";
import { isValidTimeZone } from "@/domain/zoned";

export const providers = ["google", "microsoft", "apple_ics"] as const;
export type ProviderKind = (typeof providers)[number];

export const providerLabels: Record<ProviderKind, { name: string; what: string }> = {
  google: { name: "Google", what: "Contacts and Calendar, read-only" },
  microsoft: { name: "Outlook", what: "Microsoft 365 or Outlook.com contacts and calendar, read-only" },
  apple_ics: { name: "Calendar link", what: "Apple iCloud, Outlook or any calendar you can share as a link" },
};

export const icsLinkSchema = z.object({
  url: z.string().trim().min(8, "Paste the calendar link.").max(2000, "That link is too long."),
  spaceId: z.string().uuid("Choose a Space."),
});

/** What the Android Contact Picker hands back (each field is a list). */
export const pickedContactSchema = z.object({
  name: z.array(z.string().max(200)).max(5).default([]),
  email: z.array(z.string().max(320)).max(10).default([]),
  tel: z.array(z.string().max(40)).max(10).default([]),
});
export const pickedContactsSchema = z.object({
  spaceId: z.string().uuid(),
  contacts: z.array(pickedContactSchema).min(1, "Pick at least one contact.").max(2000, "Pick up to 2,000 contacts at a time."),
});

export const triageActions = ["priority", "keep", "not_now"] as const;
export const triageActionLabels: Record<(typeof triageActions)[number], string> = {
  priority: "Priority",
  keep: "Keep",
  not_now: "Not now",
};

export const triageDecisionsSchema = z
  .array(
    z.object({
      membershipId: z.string().uuid(),
      action: z.enum(triageActions),
      cadenceDays: z.number().int().min(1).max(730).nullable().optional(),
    }),
  )
  .min(1)
  .max(200);

export const aboutYouSchema = z.object({
  name: z.string().trim().min(1, "Add your name.").max(80),
  timezone: z.string().refine(isValidTimeZone, "Choose a time zone."),
  region: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Choose a country."),
});
