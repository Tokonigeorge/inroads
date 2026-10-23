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

/** Full research is a Work-only feature (brief §4.0). The database enforces this too. */
export function researchModeAllowed(kind: SpaceKind, mode: SpaceDefaults["researchMode"]) {
  return !(mode === "full" && (kind === "personal" || kind === "dating"));
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
