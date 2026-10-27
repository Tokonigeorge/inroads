import type { pendingForPerson } from "@/server/repos/suggestions";
import type { SuggestionView } from "./suggestion-list";

type Src = { title: string; url: string };

const fieldLabel: Record<string, string> = { position: "Role", company: "Company", city: "City", birthday: "Birthday" };

export function describeSuggestion(s: Awaited<ReturnType<typeof pendingForPerson>>[number]): SuggestionView {
  const p = s.payload as Record<string, unknown>;
  const base = { id: s.id, kind: s.kind, why: s.why ?? "", sources: (s.sources as Src[]) ?? [] };
  switch (s.kind) {
    case "person_field":
      return { ...base, title: `${fieldLabel[String(p.field)] ?? "Detail"}`, value: String(p.value), editable: true };
    case "social":
      return { ...base, title: `Profile: ${String(p.key)}`, value: String(p.value), editable: true };
    case "goal_link":
      return { ...base, title: "Add to a goal", value: String(p.goalText), editable: false };
    case "interaction":
      return { ...base, title: `Touch on ${String(p.occurredOn)}`, value: String(p.summary), editable: true };
    case "commitment":
      return { ...base, title: p.owner === "me" ? "A promise you made" : "A promise they made", value: `${String(p.text)}${p.dueOn ? ` (by ${String(p.dueOn)})` : ""}`, editable: true };
    case "interests":
      return { ...base, title: "Interests", value: (p.values as string[]).join(", "), editable: false };
    default:
      return { ...base, title: "Add to notes", value: String(p.text), editable: true };
  }
}

