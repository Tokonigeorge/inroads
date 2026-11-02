/**
 * Sorting people who just came in from an import, by a rule the user picks (DECISIONS #192).
 * Inroads doesn't decide who matters: it offers rules that fit this import and this person's
 * profile and goals, shows how many each keeps, and the user chooses. Pure, so it's testable.
 */

export const sortRules = ["everyone", "met", "work", "fit", "named"] as const;
export type SortRule = (typeof sortRules)[number];

export type SortCandidate = {
  hasName: boolean;
  /** Meetings in the last 6 months, from the calendar. */
  meetings: number;
  /** Starred in Google or Outlook: you already said they matter. */
  starred: boolean;
  company: string | null;
  position: string | null;
  labels: string[];
};

/** Words that say someone fits a goal type ("Raise a seed round" is a capital goal). */
const GOAL_WORDS: Record<string, string[]> = {
  capital: ["investor", "investors", "investment", "investments", "capital", "ventures", "venture", "vc", "angel", "angels", "fund", "funds", "partner", "partners", "principal", "associate", "lp", "family office"],
  clients: ["founder", "ceo", "cto", "coo", "cfo", "head", "director", "vp", "manager", "owner", "procurement", "buyer", "purchasing", "operations", "business development"],
  hiring: ["engineer", "developer", "designer", "recruiter", "talent", "people", "hr", "product", "analyst", "lead", "senior"],
  market: ["growth", "marketing", "sales", "community", "partnerships", "media", "journalist", "editor", "press"],
  partners: ["partnerships", "partner", "alliances", "business development", "bd", "head", "director", "founder"],
  mentors: ["founder", "ceo", "chair", "chairman", "board", "director", "partner", "professor", "advisor", "adviser"],
  career: ["recruiter", "talent", "hiring", "head", "director", "vp", "manager", "founder", "ceo"],
};

const STOP = new Set(["and", "the", "for", "with", "from", "into", "our", "your", "their", "more", "new", "get", "find", "meet", "build", "grow", "make", "raise", "round", "seed", "some", "other", "people", "this", "that", "year", "month", "week", "first", "next"]);

/** The words a contact has to share (in their company, title or groups) to "fit your goals". */
export function fitWords(input: { industries: string[]; goals: { text: string; type: string }[] }): string[] {
  const words = new Set<string>();
  for (const g of input.goals) for (const w of GOAL_WORDS[g.type] ?? []) words.add(w);
  const free = [...input.industries, ...input.goals.map((g) => g.text)].join(" ");
  for (const w of free.toLowerCase().split(/[^a-z0-9&+-]+/)) if (w.length >= 4 && !STOP.has(w)) words.add(w);
  return [...words].sort();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function fitMatcher(words: string[]): (c: SortCandidate) => boolean {
  if (!words.length) return () => false;
  const re = new RegExp(`(^|[^a-z0-9])(${words.map(escape).join("|")})($|[^a-z0-9])`, "i");
  return (c) => re.test([c.company, c.position, ...c.labels].filter(Boolean).join(" · "));
}

/** Does this rule keep this person on your list? Starred contacts are always kept. */
export function keeps(rule: SortRule, c: SortCandidate, fits: (c: SortCandidate) => boolean): boolean {
  if (c.starred || rule === "everyone") return true;
  switch (rule) {
    case "met":
      return c.meetings > 0;
    case "work":
      return Boolean(c.company || c.position) || c.meetings > 0;
    case "fit":
      return fits(c) || c.meetings > 0;
    case "named":
      return c.hasName;
  }
}

export type RuleOption = { rule: SortRule; label: string; hint: string; keep: number; setAside: number };

const LABELS: Record<SortRule, { label: string; hint: string }> = {
  everyone: { label: "Keep everyone", hint: "All on your list. No reminders about anyone until you're in touch." },
  met: { label: "Keep people I've had meetings with", hint: "From your calendar, the last 6 months. The rest are set aside." },
  work: { label: "Keep people with a company or job title", hint: "Plus anyone you've met. The rest are set aside." },
  fit: { label: "Keep people who fit my goals and industries", hint: "Matched on their company, title and groups. Plus anyone you've met." },
  named: { label: "Set aside anyone without a name", hint: "Just a number or an email address." },
};

/**
 * The rules worth offering for these people: "Keep everyone" always, others only when they'd
 * actually set some people aside and keep some.
 */
export function ruleOptions(candidates: SortCandidate[], words: string[]): RuleOption[] {
  const fits = fitMatcher(words);
  const total = candidates.length;
  const out: RuleOption[] = [];
  for (const rule of sortRules) {
    if (rule === "fit" && !words.length) continue;
    const keep = candidates.filter((c) => keeps(rule, c, fits)).length;
    if (rule !== "everyone" && (keep === total || keep === 0)) continue;
    out.push({ rule, ...LABELS[rule], keep, setAside: total - keep });
  }
  return out;
}
