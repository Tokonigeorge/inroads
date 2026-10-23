import { describe, expect, it } from "vitest";
import {
  createSpaceSchema,
  defaultSpaceDefaults,
  finaliseStages,
  researchModeAllowed,
  researchModesFor,
  spaceDefaultsSchema,
  spaceKinds,
  updateSpaceSchema,
} from "./spaces";

describe("space templates", () => {
  it("every template is valid and respects the research guardrail", () => {
    for (const kind of spaceKinds) {
      const d = spaceDefaultsSchema.parse(defaultSpaceDefaults[kind]);
      expect(researchModeAllowed(kind, d.researchMode)).toBe(true);
    }
  });

  it("only Work Spaces can use full research", () => {
    expect(researchModesFor("work")).toContain("full");
    for (const kind of ["personal", "dating", "custom"] as const) {
      expect(researchModesFor(kind)).not.toContain("full");
      expect(researchModeAllowed(kind, "full")).toBe(false);
      expect(researchModeAllowed(kind, "get_to_know")).toBe(true);
    }
  });
});

describe("creating a Space", () => {
  it("trims the name and requires a type", () => {
    expect(createSpaceSchema.parse({ name: "  Alumni  ", kind: "custom" })).toEqual({ name: "Alumni", kind: "custom" });
    expect(createSpaceSchema.safeParse({ name: " ", kind: "custom" }).success).toBe(false);
    expect(createSpaceSchema.safeParse({ name: "Church", kind: "family" }).success).toBe(false);
  });
});

describe("editing stages", () => {
  const base = { name: "Work", cadenceDays: 30, researchMode: "full" as const };

  it("keeps existing keys when stages are renamed, so pipeline links survive", () => {
    const out = finaliseStages([
      { key: "identified", label: "Spotted", closed: false },
      { key: "met", label: "Met in person", closed: false },
      { label: "Signed", closed: true },
    ]);
    expect(out).toEqual([
      { key: "identified", label: "Spotted" },
      { key: "met", label: "Met in person" },
      { key: "signed", label: "Signed", closed: true },
    ]);
    expect(spaceDefaultsSchema.safeParse({ ...base, stages: out }).success).toBe(true);
  });

  it("makes safe, unique keys for new stages", () => {
    const out = finaliseStages([
      { key: "met", label: "Met", closed: false },
      { label: "Met", closed: false },
      { label: "1st date", closed: false },
      { label: "Café chat", closed: false },
      { label: "!!!", closed: false },
    ]);
    expect(out.map((s) => s.key)).toEqual(["met", "met_2", "s_1st_date", "cafe_chat", "stage"]);
  });

  it("rejects pipelines that are too short, all closed or have duplicate names", () => {
    const check = (stages: { label: string; closed?: boolean }[]) => updateSpaceSchema.safeParse({ ...base, stages }).success;
    expect(check([{ label: "Only one" }])).toBe(false);
    expect(check([{ label: "Won", closed: true }, { label: "Lost", closed: true }])).toBe(false);
    expect(check([{ label: "Met" }, { label: "met" }])).toBe(false);
    expect(check([{ label: "Met" }, { label: "Won", closed: true }])).toBe(true);
  });
});
