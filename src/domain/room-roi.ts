/**
 * What a room has led to (brief §4.2, P2 "Event ROI"): the people you met there, whether you've
 * kept in touch since, and whether they've moved forward on your goals. Counts only things you
 * recorded; nothing is inferred.
 */
import { diffDays, type IsoDate } from "./dates";

export type RoiPerson = { id: string; name: string; metOn: IsoDate };
export type RoiTouch = { personId: string; on: IsoDate };
export type RoiMove = { personId: string; forward: number; won: number };

export const IN_TOUCH_DAYS = 60;

export function roomRoi(input: { today: IsoDate; met: RoiPerson[]; touches: RoiTouch[]; moves: RoiMove[] }) {
  const people = input.met.map((p) => {
    // Touches after the day you met (the debrief's own touch is that day, so it doesn't count).
    const since = input.touches.filter((t) => t.personId === p.id && t.on > p.metOn);
    const last = since.map((t) => t.on).sort().at(-1) ?? null;
    const moved = input.moves.filter((m) => m.personId === p.id);
    return {
      ...p,
      touchesSince: since.length,
      lastTouchOn: last,
      inTouch: last !== null && diffDays(last, input.today) <= IN_TOUCH_DAYS,
      forward: moved.reduce((n, m) => n + m.forward, 0),
      won: moved.reduce((n, m) => n + m.won, 0),
    };
  });
  return {
    met: people.length,
    keptInTouch: people.filter((p) => p.touchesSince > 0).length,
    inTouchNow: people.filter((p) => p.inTouch).length,
    movedForward: people.filter((p) => p.forward > 0 || p.won > 0).length,
    won: people.filter((p) => p.won > 0).length,
    people: people.sort((a, b) => b.won - a.won || b.forward - a.forward || b.touchesSince - a.touchesSince || a.name.localeCompare(b.name)),
  };
}
export type RoomRoi = ReturnType<typeof roomRoi>;
