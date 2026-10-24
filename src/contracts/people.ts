import { z } from "zod";
import { isIsoDate } from "@/domain/dates";

/* ---------- shared pieces ---------- */

const optionalText = (max: number, message?: string) =>
  z
    .string()
    .trim()
    .max(max, message ?? `Keep it under ${max} characters.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const isoDateSchema = z.string().refine(isIsoDate, "Use a real date.");
const optionalIsoDate = z
  .union([isoDateSchema, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const socialKeys = ["linkedin", "x", "instagram", "tiktok", "github", "substack", "website"] as const;
export const socialLabels: Record<(typeof socialKeys)[number], string> = {
  linkedin: "LinkedIn",
  x: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
  github: "GitHub",
  substack: "Substack",
  website: "Website",
};
export const socialsSchema = z
  .partialRecord(z.enum(socialKeys), z.string().trim().max(200))
  .default({})
  .transform((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v)) as Partial<Record<(typeof socialKeys)[number], string>>);

/** Birthday as MM-DD (year left out on purpose). */
export const birthdaySchema = z
  .union([z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Pick a month and day."), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** "a, b; c" → ["a", "b", "c"] for free-text list fields. */
export const listFromText = (max: number, itemMax = 60) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      const items = Array.isArray(v) ? v : String(v ?? "").split(/[,;\n]/);
      return [...new Set(items.map((x) => x.trim()).filter(Boolean))];
    })
    .pipe(z.array(z.string().max(itemMax, `Keep each item under ${itemMax} characters.`)).max(max, `Up to ${max} items.`));

/** Tags are short, lowercase and hyphenated: "Lagos Fintech" → "lagos-fintech". */
export const tagsSchema = listFromText(20, 40).transform((tags) => [
  ...new Set(tags.map((t) => t.toLowerCase().replace(/^#/, "").replace(/\s+/g, "-")).filter(Boolean)),
]);

/** null = use the circle or Space default, 0 = never remind, n = every n days. */
export const cadenceSchema = z
  .union([z.literal("inherit"), z.literal("never"), z.coerce.number().int().min(1).max(365), z.null()])
  .optional()
  .transform((v) => (v === "never" ? 0 : v === "inherit" || v == null ? null : v));

/* ---------- people ---------- */

export const personIdentitySchema = z.object({
  name: z.string().trim().min(1, "Add a name.").max(120, "Keep the name under 120 characters."),
  emails: z.array(z.string()).max(10).default([]),
  phones: z.array(z.string()).max(10).default([]),
  company: optionalText(120),
  position: optionalText(120),
  city: optionalText(120),
  birthday: birthdaySchema,
  socials: socialsSchema,
});
export type PersonIdentityInput = z.input<typeof personIdentitySchema>;
export type PersonIdentity = z.output<typeof personIdentitySchema>;

/** Your relationship with a person inside one Space. */
export const membershipSchema = z.object({
  spaceId: z.string().uuid("Choose a Space."),
  whereMet: optionalText(200),
  metOn: optionalIsoDate,
  interests: listFromText(20),
  notes: optionalText(10_000, "Notes are limited to 10,000 characters."),
  opportunities: optionalText(2_000),
  tags: tagsSchema,
  circleId: z
    .union([z.string().uuid(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  cadenceDays: cadenceSchema,
  starred: z.boolean().default(false),
});
export type MembershipInput = z.input<typeof membershipSchema>;
export type Membership = z.output<typeof membershipSchema>;

export const createPersonSchema = z.object({
  /** Client-generated so offline captures can be replayed safely. */
  id: z.string().uuid(),
  identity: personIdentitySchema,
  membership: membershipSchema,
});
export type CreatePersonInput = z.input<typeof createPersonSchema>;

/* ---------- touches and promises ---------- */

export const touchTypes = ["coffee", "call", "meeting", "message", "email", "event", "other"] as const;
export type TouchType = (typeof touchTypes)[number];
export const touchTypeLabels: Record<TouchType, string> = {
  coffee: "Coffee",
  call: "Call",
  meeting: "Meeting",
  message: "Message",
  email: "Email",
  event: "At an event",
  other: "Other",
};

export const promiseOwners = ["me", "them"] as const;

export const promiseSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  spaceId: z.string().uuid(),
  text: z.string().trim().min(1, "Say what was promised.").max(300, "Keep it under 300 characters."),
  owner: z.enum(promiseOwners),
  dueOn: optionalIsoDate,
});
export type PromiseInput = z.input<typeof promiseSchema>;

export const touchSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  spaceId: z.string().uuid(),
  occurredOn: isoDateSchema,
  type: z.enum(touchTypes),
  summary: optionalText(2_000),
  /** Optional promise made in the same moment. */
  promise: promiseSchema.omit({ personId: true, spaceId: true }).nullable().optional(),
});
export type TouchInput = z.input<typeof touchSchema>;

/* ---------- capture (offline-capable) ---------- */

/**
 * Everything the phone can save without a connection. Each carries a client-generated id, so
 * replaying a queued capture twice never creates duplicates.
 */
export const captureSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("person"), data: createPersonSchema }),
  z.object({ kind: z.literal("touch"), data: touchSchema }),
  z.object({ kind: z.literal("promise"), data: promiseSchema }),
  z.object({ kind: z.literal("promise_done"), data: z.object({ id: z.string().uuid(), done: z.boolean() }) }),
]);
export type Capture = z.input<typeof captureSchema>;

/* ---------- list query ---------- */

export const peopleFilters = ["all", "starred", "due", "context", "untouched", "unsorted", "archived"] as const;
export type PeopleFilter = (typeof peopleFilters)[number];
export const peopleFilterLabels: Record<PeopleFilter, string> = {
  all: "Everyone",
  starred: "Priority",
  due: "Due for a touch",
  context: "Needs context",
  untouched: "No touches yet",
  unsorted: "Not sorted yet",
  archived: "Archived",
};

export const peopleSorts = ["name", "recent", "due", "added"] as const;
export type PeopleSort = (typeof peopleSorts)[number];
export const peopleSortLabels: Record<PeopleSort, string> = {
  name: "Name",
  recent: "Last spoken to",
  due: "Most overdue",
  added: "Recently added",
};

export const peopleQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  spaceId: z.string().uuid().nullable().optional().default(null),
  filter: z.enum(peopleFilters).optional().default("all"),
  tag: z.string().trim().max(40).optional(),
  circleId: z.string().uuid().optional(),
  sort: z.enum(peopleSorts).optional().default("name"),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(60),
});
export type PeopleQuery = z.input<typeof peopleQuerySchema>;
