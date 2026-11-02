import { describe, expect, it } from "vitest";
import { fitMatcher, fitWords, keeps, ruleOptions, type SortCandidate } from "./sort-rules";

const c = (o: Partial<SortCandidate>): SortCandidate => ({ hasName: true, meetings: 0, starred: false, company: null, position: null, labels: [], ...o });

describe("sort rules", () => {
  const words = fitWords({ industries: ["Fintech"], goals: [{ text: "Raise a seed round", type: "capital" }] });

  it("builds fit words from goal types and industries, without filler words", () => {
    expect(words).toContain("investor");
    expect(words).toContain("ventures");
    expect(words).toContain("fintech");
    expect(words).not.toContain("raise");
    expect(words).not.toContain("round");
  });

  it("matches whole words in company, title and groups", () => {
    const fits = fitMatcher(words);
    expect(fits(c({ company: "Ventures Platform" }))).toBe(true);
    expect(fits(c({ position: "Angel investor" }))).toBe(true);
    expect(fits(c({ labels: ["Fintech friends"] }))).toBe(true);
    expect(fits(c({ company: "Fundamental Foods" }))).toBe(false); // "fund" inside a word
    expect(fits(c({ company: "Acme Bakery" }))).toBe(false);
  });

  it("always keeps people starred in Google, and anyone met for the narrower rules", () => {
    const fits = fitMatcher(words);
    expect(keeps("met", c({ starred: true }), fits)).toBe(true);
    expect(keeps("work", c({ meetings: 2 }), fits)).toBe(true);
    expect(keeps("named", c({ hasName: false }), fits)).toBe(false);
  });

  it("offers Keep everyone, plus only the rules that would actually split the list", () => {
    const people = [c({ meetings: 3, company: "Ventures Platform" }), c({ company: "Acme Bakery" }), c({ hasName: false })];
    const opts = ruleOptions(people, words);
    expect(opts.map((o) => [o.rule, o.keep, o.setAside])).toEqual([
      ["everyone", 3, 0],
      ["met", 1, 2],
      ["work", 2, 1],
      ["fit", 1, 2],
      ["named", 2, 1],
    ]);
    // Nobody has meetings: "people I've met" would keep nobody, so it isn't offered; no goals, no fit rule.
    expect(ruleOptions([c({}), c({ company: "X" })], []).map((o) => o.rule)).toEqual(["everyone", "work"]);
  });
});
