/**
 * The suggested sort for newly imported people (TECH_PLAN §4.3a). No AI: just the signals the
 * import already has. Every suggestion carries a plain reason the user can see.
 */
export const triageActions = ["priority", "keep", "not_now"] as const;
export type TriageAction = (typeof triageActions)[number];
export const triageActionLabels: Record<TriageAction, string> = { priority: "Priority", keep: "Keep", not_now: "Not now" };

export type TriageSignals = {
  starred: boolean;
  labels: string[];
  hasName: boolean;
  meetings: number;
  company: string | null;
  position: string | null;
  provider: string;
};

export function suggestTriage(s: TriageSignals): { action: TriageAction; reason: string } {
  const where = s.provider === "microsoft" ? "Outlook" : s.provider === "google" ? "Google" : "your contacts";
  if (!s.hasName && s.meetings === 0) return { action: "not_now", reason: "No name saved, just a number or address" };
  if (s.starred) return { action: "priority", reason: `Starred in ${where}` };
  if (s.meetings >= 3) return { action: "priority", reason: `${s.meetings} meetings in the last 6 months` };
  if (s.meetings >= 1) return { action: "keep", reason: s.meetings === 1 ? "1 meeting in the last 6 months" : `${s.meetings} meetings in the last 6 months` };
  if (s.labels.length) return { action: "keep", reason: `In your "${s.labels[0]}" group` };
  if (s.company || s.position) return { action: "keep", reason: [s.position, s.company].filter(Boolean).join(" at ") };
  return { action: "not_now", reason: "No meetings or details yet" };
}
