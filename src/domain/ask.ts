/**
 * "Ask your network" without AI: turn a question into search terms. Drops filler words and
 * trims common endings so "investors" also finds "invests" and "raised" finds "raise".
 */
const STOP = new Set(
  "who whom whose which what where when why how do does did i me my mine we our you your know knows knew someone somebody anyone anybody people person in on at to of for from by with about into the a an and or but not is are was were be been being has have had having that this these those there their them they he she his her it its can could would should will shall may might must any some all most more less very really just also in-network network".split(
    " ",
  ),
);

export function stem(word: string): string {
  const w = word.toLowerCase();
  for (const suffix of ["ings", "ing", "ers", "er", "ies", "ied", "es", "ed", "s"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) return suffix.startsWith("ie") ? `${w.slice(0, -suffix.length)}y` : w.slice(0, -suffix.length);
  }
  return w;
}

export function questionTerms(question: string): string[] {
  const words = question
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .split(/[^\p{L}\p{N}&+.-]+/u)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return [...new Set(words.map(stem))].slice(0, 10);
}

/** "Mentions fintech and Accra": why a person matched, from the terms found in their details. */
export function matchReason(found: string[]): string {
  if (!found.length) return "";
  const list = found.length === 1 ? found[0] : `${found.slice(0, -1).join(", ")} and ${found.at(-1)}`;
  return `Mentions ${list}`;
}
