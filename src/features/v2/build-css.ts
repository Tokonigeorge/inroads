/**
 * Builds Inroads 2's stylesheet from the design system (docs/design/inroads-2): the tokens become
 * custom properties on `.v2` (not :root, so the current app's tokens of the same names are
 * untouched), and the component styles follow as they are. Run `pnpm build:v2-css` after changing
 * either file; a test fails if the committed stylesheet is out of date.
 */

type Themed = { light: string; dark: string };
type Token = { name: string; value: string | Themed };
type Tokens = {
  color: { tokens: Token[] };
  shadow: { tokens: Token[] };
  spacing: { tokens: Token[] };
  radius: { tokens: Token[] };
  duration: { tokens: Token[] };
  easing: { tokens: Token[] };
  type: { families: Record<string, string> };
};

/** Geist comes from next/font (already loaded by the root layout); fall back to the named stacks. */
const FONTS: Record<string, string> = {
  display: 'var(--font-geist), "Geist", system-ui, -apple-system, "Segoe UI", sans-serif',
  body: 'var(--font-geist), "Geist", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: 'var(--font-geist-mono), "Geist Mono", ui-monospace, "SFMono-Regular", Menlo, monospace',
};

const themed = (t: Token, theme: "light" | "dark") => (typeof t.value === "string" ? t.value : t.value[theme]);

export function buildV2Css(tokens: Tokens, components: string): string {
  const colours = [...tokens.color.tokens, ...tokens.shadow.tokens];
  const fixed = [...tokens.spacing.tokens, ...tokens.radius.tokens, ...tokens.duration.tokens, ...tokens.easing.tokens];
  const light = colours.map((t) => `  --${t.name}: ${themed(t, "light")};`);
  const dark = colours.map((t) => `    --${t.name}: ${themed(t, "dark")};`);
  const rest = [...fixed.map((t) => `  --${t.name}: ${t.value};`), ...Object.keys(tokens.type.families).map((k) => `  --font-${k}: ${FONTS[k] ?? tokens.type.families[k]};`)];

  // The design system's own previews switch themes with [data-theme="dark"]; Inroads 2 follows the device.
  const body = components
    .replace(/^@import url\([^)]*\);\n/m, "")
    .replace(/^\[data-theme="dark"\] (.+)$/gm, "@media (prefers-color-scheme: dark) { $1 }");

  return [
    "/* Inroads 2: generated from docs/design/inroads-2 by `pnpm build:v2-css`. Don't edit by hand. */",
    ".v2 {",
    ...light,
    ...rest,
    "  color-scheme: light;",
    "  background: var(--paper);",
    "  color: var(--ink);",
    "}",
    "@media (prefers-color-scheme: dark) {",
    "  .v2 {",
    ...dark,
    "    color-scheme: dark;",
    "  }",
    "}",
    body.trim(),
    "",
  ].join("\n");
}
