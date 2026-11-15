import { readFileSync, writeFileSync } from "node:fs";
import { buildV2Css } from "../src/features/v2/build-css";

// Rebuilds src/features/v2/v2.css from the design system files in docs/design/inroads-2.
const tokens = JSON.parse(readFileSync("docs/design/inroads-2/tokens.json", "utf8"));
const components = readFileSync("docs/design/inroads-2/components.css", "utf8");
writeFileSync("src/features/v2/v2.css", buildV2Css(tokens, components));
console.log("Wrote src/features/v2/v2.css");
