import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { formatLongDate } from "@/domain/dates";
import { formatTime } from "@/domain/zoned";

export type WeekRoom = {
  eventId: string;
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  /** "ready" with what the plan found, "preparing" while it runs, "none" when nothing has started. */
  plan: { state: "ready"; toMeet: number; openings: number } | { state: "preparing" } | { state: "none" };
};

/** Rooms in the next seven days, each with where its plan stands and the one thing to do next. */
export function ThisWeek({ rooms, today }: { rooms: WeekRoom[]; today: string }) {
  return (
    <ol className="grid gap-2">
      {rooms.map((r) => (
        <li key={`${r.eventId}:${r.date}`}>
          <Link
            href={`/rooms/${r.eventId}`}
            className="group grid gap-1 rounded-md border border-border bg-surface p-3 transition-colors hover:border-accent hover:bg-accent-soft/40"
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-semibold group-hover:underline">{r.title}</span>
              <span className="shrink-0 text-small text-muted tabular">
                {formatLongDate(r.date, today)}
                {r.time ? ` · ${formatTime(r.time)}` : ""}
              </span>
            </span>
            {r.location ? <span className="text-small text-muted">{r.location}</span> : null}
            <PlanLine plan={r.plan} />
          </Link>
        </li>
      ))}
    </ol>
  );
}

function PlanLine({ plan }: { plan: WeekRoom["plan"] }) {
  if (plan.state === "preparing")
    return (
      <span className="flex items-center gap-1.5 text-small text-muted">
        <Loader2 size={14} className="animate-spin" aria-hidden /> Preparing your plan…
      </span>
    );
  if (plan.state === "ready") {
    const found = [plan.toMeet ? `${plan.toMeet} ${plan.toMeet === 1 ? "person" : "people"} to meet` : null, plan.openings ? `${plan.openings} ${plan.openings === 1 ? "opening" : "openings"}` : null]
      .filter(Boolean)
      .join(", ");
    return (
      <span className="flex items-center gap-1.5 text-small font-[550] text-accent">
        <CheckCircle2 size={14} aria-hidden /> Plan ready{found ? `: ${found}` : ""}. Open to review →
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-small font-[550] text-accent">
      <Sparkles size={14} aria-hidden /> Prepare for this room →
    </span>
  );
}
