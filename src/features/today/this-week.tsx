import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { formatLongDate } from "@/domain/dates";
import { formatTime } from "@/domain/zoned";
import { RoomKindIcon } from "@/features/rooms/room-kind-icon";

export type WeekRoom = {
  eventId: string;
  title: string;
  kind: string;
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
      {rooms.map((r, i) => (
        <li key={`${r.eventId}:${r.date}`} className="rise" style={{ ["--i" as string]: i }}>
          <Link
            href={`/rooms/${r.eventId}`}
            className="lift group flex gap-3 rounded-md border border-border bg-surface p-3 hover:border-accent"
          >
            <RoomKindIcon kind={r.kind} />
            <span className="grid min-w-0 flex-1 gap-1">
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-semibold group-hover:underline">{r.title}</span>
              <span className="shrink-0 text-small text-muted tabular">
                {formatLongDate(r.date, today)}
                {r.time ? ` · ${formatTime(r.time)}` : ""}
              </span>
            </span>
            {r.location ? <span className="text-small text-muted">{r.location}</span> : null}
            <PlanLine plan={r.plan} />
            </span>
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
