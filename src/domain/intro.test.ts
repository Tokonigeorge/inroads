import { describe, expect, it } from "vitest";
import { introAsk } from "./intro";

describe("introAsk", () => {
  it("asks for consent first, mentions the goal only when there is one", () => {
    const withGoal = introAsk({ connector: "Kemi Adebayo", target: "Tunde Bakare", targetDetail: "Partner at Kestrel Ventures", goal: "Raise a pre-seed round" });
    expect(withGoal).toMatch(/^Hi Kemi, hope you're well! I'd love to meet Tunde Bakare \(Partner at Kestrel Ventures\)\. I'm working on "Raise a pre-seed round"/);
    expect(withGoal).toContain("happy to be introduced");
    expect(introAsk({ connector: "Kemi", target: "Tunde", targetDetail: "", goal: null })).not.toContain("working on");
  });
});
