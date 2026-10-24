import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** WCAG 2.1 AA in both themes. Any violation fails the test. */
export async function expectAccessible(page: Page) {
  // Next streams the <title> in with the page (and re-sends it on refresh); wait for it so the
  // check sees the page the user sees. A page that never gets a title still fails.
  await expect(page).toHaveTitle(/\S/);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(
      results.violations.map((v) => ({ id: v.id, theme: colorScheme, nodes: v.nodes.map((n) => n.target.join(" ")) })),
    ).toEqual([]);
  }
}
