import Link from "next/link";
import { formatLongDate } from "@/domain/dates";
import { AiJobButton } from "@/features/ai/ai-job-button";
import { RoomIdeas, type RoomIdea } from "@/features/ai/room-ideas";
import { Section } from "@/ui/layout";
import { StepCheck } from "./step-check";

export type DueStep = { id: string; text: string; dueOn: string | null; goalId: string; goal: string };
export type GoalRooms = { searchId: string; spaceId: string; items: RoomIdea[] } | null;

/**
 * Today's goal work: steps that are due, and rooms found this week for your goals. The rooms are
 * searched for in the background once a week; until the first search, you can start one here.
 */
export function ForYourGoals({ steps, rooms, today, canSearch }: { steps: DueStep[]; rooms: GoalRooms; today: string; canSearch: { spaceId: string; aiEnabled: boolean } | null }) {
  if (!steps.length && !rooms?.items.length && !canSearch) return null;
  return (
    <div className="grid gap-8 pt-8 md:grid-cols-[3fr_2fr]">
      <Section title="Rooms for your goals">
        {rooms?.items.length ? (
          <div className="grid gap-3">
            <RoomIdeas searchId={rooms.searchId} items={rooms.items} />
            <Link href="/rooms#radar" className="text-small font-[550] text-accent hover:underline">
              See all suggested rooms
            </Link>
          </div>
        ) : canSearch ? (
          <div className="grid gap-3">
            <p className="text-small text-muted">Inroads looks for events that serve your goals every week. Run the first search now.</p>
            <AiJobButton aiEnabled={canSearch.aiEnabled} job={{ kind: "radar", spaceId: canSearch.spaceId }} label="Find rooms for my goals" />
          </div>
        ) : (
          <p className="text-small text-muted">Nothing new this week.</p>
        )}
      </Section>
      <Section title={steps.length ? `Steps due · ${steps.length}` : "Steps due"}>
        {steps.length ? (
          <ul className="grid gap-2">
            {steps.map((s) => (
              <li key={s.id} className="flex items-start gap-3">
                <StepCheck id={s.id} text={s.text} />
                <span className="grid min-w-0">
                  <span>{s.text}</span>
                  <span className="text-small text-muted">
                    {s.dueOn ? `${s.dueOn < today ? "Overdue · " : ""}${formatLongDate(s.dueOn, today)} · ` : ""}
                    <Link href={`/goals/${s.goalId}`} className="hover:underline">
                      {s.goal}
                    </Link>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-muted">No goal steps due. Add some on a goal, or from a room&apos;s plan.</p>
        )}
      </Section>
    </div>
  );
}
