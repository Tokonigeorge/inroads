import { describe, expect, it } from "vitest";
import { socialUrl } from "./socials";

describe("socialUrl", () => {
  it("passes URLs through and builds profile links from handles", () => {
    expect(socialUrl("linkedin", "https://www.linkedin.com/in/ada")).toBe("https://www.linkedin.com/in/ada");
    expect(socialUrl("linkedin", "ada-okafor")).toBe("https://www.linkedin.com/in/ada-okafor");
    expect(socialUrl("x", "@ada")).toBe("https://x.com/ada");
    expect(socialUrl("instagram", "ada")).toBe("https://instagram.com/ada");
    expect(socialUrl("tiktok", "@ada")).toBe("https://www.tiktok.com/@ada");
    expect(socialUrl("github", "ada")).toBe("https://github.com/ada");
    expect(socialUrl("substack", "ada")).toBe("https://ada.substack.com");
  });

  it("treats bare domains and websites as sites", () => {
    expect(socialUrl("website", "ada.example")).toBe("https://ada.example");
    expect(socialUrl("x", "ada.dev/about")).toBe("https://ada.dev/about");
  });

  it("returns nothing for empty values or unknown networks", () => {
    expect(socialUrl("x", "  ")).toBe("");
    expect(socialUrl("myspace", "ada")).toBe("");
  });
});
