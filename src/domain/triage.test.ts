import { describe, expect, it } from "vitest";
import { suggestTriage, type TriageSignals } from "./triage";

const s = (o: Partial<TriageSignals>): TriageSignals => ({ starred: false, labels: [], hasName: true, meetings: 0, company: null, position: null, provider: "google", ...o });

describe("suggested sort", () => {
  it("puts starred contacts and frequent meetings first", () => {
    expect(suggestTriage(s({ starred: true }))).toEqual({ action: "priority", reason: "Starred in Google" });
    expect(suggestTriage(s({ meetings: 4 }))).toEqual({ action: "priority", reason: "4 meetings in the last 6 months" });
  });
  it("keeps people with some signal, saying which", () => {
    expect(suggestTriage(s({ meetings: 1 })).reason).toBe("1 meeting in the last 6 months");
    expect(suggestTriage(s({ labels: ["Investors"] }))).toEqual({ action: "keep", reason: 'In your "Investors" group' });
    expect(suggestTriage(s({ company: "Paystack", position: "Engineer" }))).toEqual({ action: "keep", reason: "Engineer at Paystack" });
  });
  it("suggests not now for bare entries", () => {
    expect(suggestTriage(s({}))).toEqual({ action: "not_now", reason: "No meetings or details yet" });
    expect(suggestTriage(s({ hasName: false, starred: true }))).toMatchObject({ action: "not_now" });
    expect(suggestTriage(s({ hasName: false, meetings: 2 })).action).toBe("keep");
  });
});
