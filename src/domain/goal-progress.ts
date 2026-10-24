/**
 * Weekly goal progress. Replaces the prototype's goalProgress(), which only counted touches
 * with people linked silently by substring matching (brief §2, bugs 7 and 8). Here everything
 * counted comes from an explicit link: touches with people in the goal's pipeline, stage
 * moves in the pipeline, and sessions you went to of rooms tied to the goal.
 */
import { addDays, weekday, type IsoDate } from "./dates";

export type StageDef = { key: string; label: string; closed?: boolean };

/** Monday to Sunday containing `today` (the user's own date). */
export function weekOf(today: IsoDate): { start: IsoDate; end: IsoDate } {
  const start = addDays(today, -((weekday(today) + 6) % 7));
  return { start, end: addDays(start, 6) };
}

export type StageMove = { from: string | null; to: string };

/**
 * A move counts as forward when it goes to a later stage, or to the first closed stage ("Won"),
 * and as back otherwise. Moving to a closed stage that isn't the first one ("Closed", "Ended")
 * counts as closed, not as progress. Unknown stage keys (renamed away) are ignored.
 */
export function classifyMoves(moves: StageMove[], stages: StageDef[]) {
  const index = new Map(stages.map((s, i) => [s.key, i]));
  const firstClosed = stages.findIndex((s) => s.closed);
  let forward = 0;
  let back = 0;
  let won = 0;
  let closed = 0;
  for (const m of moves) {
    if (m.from === null) continue; // added to the pipeline, not a move
    const a = index.get(m.from);
    const b = index.get(m.to);
    if (a === undefined || b === undefined || a === b) continue;
    if (stages[b].closed) {
      if (b === firstClosed) won++;
      else closed++;
      continue;
    }
    if (b > a) forward++;
    else back++;
  }
  return { forward, back, won, closed };
}

export type WeeklyProgress = {
  touches: number;
  peopleTouched: number;
  rooms: number;
  moves: { forward: number; back: number; won: number; closed: number };
  target: number;
};

/** The meter: touches with pipeline people (a session you went to counts as one) against the target. */
export function progressMeter(p: Pick<WeeklyProgress, "touches" | "rooms" | "target">) {
  const done = p.touches + p.rooms;
  const target = Math.max(1, p.target);
  return { done, target, ratio: Math.min(1, done / target), label: done >= target ? "On track" : `${target - done} to go` };
}

/** Plain-words summary for a goal's week, e.g. "4 touches with 3 people · 2 moved forward · 1 won". */
export function progressSummary(p: WeeklyProgress): string {
  const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
  const parts = [p.touches ? `${n(p.touches, "touch", "touches")} with ${n(p.peopleTouched, "person", "people")}` : "No touches yet"];
  if (p.rooms) parts.push(n(p.rooms, "room", "rooms"));
  if (p.moves.forward) parts.push(`${p.moves.forward} moved forward`);
  if (p.moves.won) parts.push(`${p.moves.won} won`);
  return parts.join(" · ");
}

/** The stage a person lands on when added to a goal: the first open stage. */
export function firstOpenStage(stages: StageDef[]): StageDef {
  return stages.find((s) => !s.closed) ?? stages[0];
}
