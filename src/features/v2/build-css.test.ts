import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildV2Css } from "./build-css";

const tokens = JSON.parse(readFileSync("docs/design/inroads-2/tokens.json", "utf8"));
const components = readFileSync("docs/design/inroads-2/components.css", "utf8");

/** WCAG relative luminance and contrast. */
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const colour = (name: string, theme: "light" | "dark") => tokens.color.tokens.find((t: { name: string }) => t.name === name).value[theme] as string;

describe("Inroads 2 stylesheet", () => {
  it("is up to date with the design system (run pnpm build:v2-css)", () => {
    expect(readFileSync("src/features/v2/v2.css", "utf8")).toBe(buildV2Css(tokens, components));
  });

  it("scopes tokens to .v2 so the current app's tokens are untouched", () => {
    const css = buildV2Css(tokens, components);
    expect(css).not.toMatch(/:root\s*\{/);
    expect(css).toContain(".v2 {\n  --paper: #f5f2eb;");
    expect(css).not.toContain('[data-theme="dark"]');
  });

  it.each(["light", "dark"] as const)("keeps text readable in the %s theme", (theme) => {
    const pairs: [string, string, number][] = [
      ["ink", "paper", 4.5], ["ink", "surface", 4.5], ["ink-muted", "paper", 4.5], ["ink-muted", "surface", 4.5],
      ["on-blue", "blue", 4.5], ["blue", "surface", 4.5], ["blue-deep", "blue-soft", 4.5], ["on-peach", "peach", 4.5],
      ["on-butter", "butter", 4.5], ["on-mint", "mint", 4.5], ["ink-muted", "peach", 4.5], ["ink-muted", "butter", 4.5],
      ["danger", "surface", 4.5], ["line-strong", "surface", 3],
    ];
    for (const [fg, bg, min] of pairs) expect(contrast(colour(fg, theme), colour(bg, theme)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
  });
});
