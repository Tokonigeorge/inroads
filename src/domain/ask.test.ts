import { describe, expect, it } from "vitest";
import { matchReason, questionTerms, stem } from "./ask";

describe("ask your network: terms", () => {
  it("keeps the words that matter and trims endings", () => {
    expect(questionTerms("Who do I know in fintech in Accra who's raised before?")).toEqual(["fintech", "accra", "rais", "before"]);
    expect(questionTerms("investors who like B2B payments")).toEqual(["investor", "like", "b2b", "payment"]);
    expect(stem("companies")).toBe("company");
    expect(stem("bus")).toBe("bus");
  });

  it("explains matches in plain words", () => {
    expect(matchReason(["fintech"])).toBe("Mentions fintech");
    expect(matchReason(["fintech", "accra", "payments"])).toBe("Mentions fintech, accra and payments");
  });
});
