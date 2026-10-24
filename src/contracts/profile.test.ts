import { describe, expect, it } from "vitest";
import { profileSchema } from "./profile";

const base = { name: "Ada", headline: "", location: "", background: "", offerings: "", industries: "", timezone: "Africa/Lagos", region: "ng", briefTime: "07:30" };

describe("profileSchema", () => {
  it("trims, turns blanks into null and splits industries", () => {
    const r = profileSchema.parse({ ...base, headline: "  Founder  ", industries: "Fintech, payments ,, Fintech" });
    expect(r).toMatchObject({ headline: "Founder", location: null, region: "NG", industries: ["Fintech", "payments"] });
  });

  it("rejects unknown time zones, bad times and too many industries", () => {
    const r = profileSchema.safeParse({ ...base, timezone: "Mars/Olympus", briefTime: "25:00", industries: Array.from({ length: 11 }, (_, i) => `i${i}`).join(",") });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["timezone", "briefTime", "industries"]));
  });
});
