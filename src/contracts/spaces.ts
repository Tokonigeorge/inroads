import { z } from "zod";

export const spaceKinds = ["work", "personal", "dating", "custom"] as const;
export type SpaceKind = (typeof spaceKinds)[number];

export const researchModes = ["full", "get_to_know", "off"] as const;

export const stageSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: z.string().min(1).max(40),
  closed: z.boolean().optional(),
});

export const spaceDefaultsSchema = z
  .object({
    cadenceDays: z.number().int().min(0).max(365).nullable(),
    researchMode: z.enum(researchModes),
    stages: z.array(stageSchema).min(2).max(12),
  })
  .refine((d) => new Set(d.stages.map((s) => s.key)).size === d.stages.length, {
    message: "Stage keys must be unique",
    path: ["stages"],
  });

export type SpaceDefaults = z.infer<typeof spaceDefaultsSchema>;
export type Stage = z.infer<typeof stageSchema>;

/**
 * Full research (a professional dossier from the open web) is only for Work-type Spaces.
 * Personal, Dating and Other Spaces get "Get to know" or nothing (brief §4.0). The database
 * enforces the same rule.
 */
export function researchModesFor(kind: SpaceKind): readonly SpaceDefaults["researchMode"][] {
  return kind === "work" ? researchModes : (["get_to_know", "off"] as const);
}

export function researchModeAllowed(kind: SpaceKind, mode: SpaceDefaults["researchMode"]) {
  return researchModesFor(kind).includes(mode);
}

export const researchModeLabels: Record<SpaceDefaults["researchMode"], { label: string; hint: string }> = {
  full: { label: "Full research", hint: "A profile of their public professional life, with sources." },
  get_to_know: {
    label: "Get to know",
    hint: "Conversation starters from what they've shared about themselves. Never family, address, past relationships or money.",
  },
  off: { label: "Off", hint: "No research buttons in this Space." },
};

export const spaceKindLabels: Record<SpaceKind, { label: string; hint: string }> = {
  work: { label: "Work", hint: "Clients, investors, colleagues, hiring. Full research is available." },
  personal: { label: "Personal", hint: "Friends, family and community." },
  dating: { label: "Dating", hint: "People you're seeing or talking to." },
  custom: { label: "Other", hint: "Anything else, like a church, alumni group or club." },
};

/** Reminder choices offered in forms. null = no default reminder. */
export const cadenceChoices: { days: number | null; label: string }[] = [
  { days: 7, label: "Every week" },
  { days: 14, label: "Every 2 weeks" },
  { days: 21, label: "Every 3 weeks" },
  { days: 30, label: "Every month" },
  { days: 60, label: "Every 2 months" },
  { days: 90, label: "Every 3 months" },
  { days: 180, label: "Every 6 months" },
  { days: null, label: "No reminder" },
];

export function cadenceLabel(days: number | null | undefined) {
  if (!days) return "No reminder";
  return cadenceChoices.find((c) => c.days === days)?.label ?? `Every ${days} days`;
}

export const MAX_SPACES = 12;

export const spaceNameSchema = z
  .string()
  .trim()
  .min(1, "Give the Space a name.")
  .max(40, "Keep the name under 40 characters.");

export const createSpaceSchema = z.object({
  name: spaceNameSchema,
  kind: z.enum(spaceKinds, { error: "Choose what the Space is for." }),
});

/** A stage as edited in a form: existing stages keep their key, new ones get one from the label. */
export const stageDraftSchema = z.object({
  key: z.string().optional(),
  label: z.string().trim().min(1, "Every stage needs a name.").max(40, "Keep stage names under 40 characters."),
  closed: z.boolean().default(false),
});

export const updateSpaceSchema = z.object({
  name: spaceNameSchema,
  cadenceDays: z.number().int().min(1).max(365).nullable(),
  researchMode: z.enum(researchModes),
  stages: z
    .array(stageDraftSchema)
    .min(2, "A pipeline needs at least two stages.")
    .max(12, "Keep it to 12 stages or fewer.")
    .refine((st) => st.some((x) => !x.closed), "At least one stage must be open (not an end state).")
    .refine(
      (st) => new Set(st.map((x) => x.label.toLowerCase())).size === st.length,
      "Two stages have the same name.",
    ),
});
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>;

/** Turns form stages into stored stages, keeping existing keys so pipeline links survive renames. */
export function finaliseStages(drafts: z.infer<typeof stageDraftSchema>[]): Stage[] {
  const used = new Set(drafts.map((d) => d.key).filter((k): k is string => Boolean(k)));
  return drafts.map((d) => {
    let key = d.key;
    if (!key || !stageSchema.shape.key.safeParse(key).success) {
      const base =
        d.label
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .replace(/^(\d)/, "s_$1")
          .slice(0, 36) || "stage";
      key = base;
      for (let i = 2; used.has(key); i++) key = `${base}_${i}`;
      used.add(key);
    }
    return d.closed ? { key, label: d.label, closed: true } : { key, label: d.label };
  });
}

const s = (key: string, label: string, closed?: true): Stage => (closed ? { key, label, closed } : { key, label });

/** Mirrors public.default_space_defaults() in SQL. tests/db/spaces.test.ts keeps them in sync. */
export const defaultSpaceDefaults: Record<SpaceKind, SpaceDefaults> = {
  work: {
    cadenceDays: 30,
    researchMode: "full",
    stages: [
      s("identified", "Identified"),
      s("warm_path", "Warm path found"),
      s("introduced", "Introduced"),
      s("met", "Met"),
      s("in_conversation", "In conversation"),
      s("won", "Won", true),
      s("closed", "Closed", true),
    ],
  },
  personal: {
    cadenceDays: 21,
    researchMode: "get_to_know",
    stages: [
      s("want_to_know", "Want to get to know"),
      s("met", "Met"),
      s("spent_time", "Spent time together"),
      s("regular", "See regularly"),
      s("close", "Close", true),
    ],
  },
  dating: {
    cadenceDays: 7,
    researchMode: "get_to_know",
    stages: [
      s("matched", "Matched"),
      s("talking", "Talking"),
      s("first_date", "First date"),
      s("seeing", "Seeing each other"),
      s("exclusive", "Exclusive", true),
      s("ended", "Ended", true),
    ],
  },
  custom: {
    cadenceDays: 30,
    researchMode: "get_to_know",
    stages: [s("identified", "Identified"), s("met", "Met"), s("in_touch", "In touch"), s("done", "Done", true)],
  },
};
