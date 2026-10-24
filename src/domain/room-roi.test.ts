import { describe, expect, it } from "vitest";
import { roomRoi } from "./room-roi";

describe("roomRoi", () => {
  it("counts only touches after you met, keeps 'in touch' to the last 60 days, ranks wins first", () => {
    const r = roomRoi({
      today: "2026-10-24",
      met: [
        { id: "a", name: "Ada", metOn: "2026-08-01" },
        { id: "k", name: "Kwame", metOn: "2026-08-01" },
        { id: "t", name: "Tola", metOn: "2026-10-01" },
      ],
      touches: [
        { personId: "a", on: "2026-08-01" }, // the day you met: not "since"
        { personId: "a", on: "2026-10-10" },
        { personId: "k", on: "2026-08-05" }, // since, but more than 60 days ago
        { personId: "t", on: "2026-10-01" },
      ],
      moves: [{ personId: "k", forward: 2, won: 1 }],
    });
    expect(r).toMatchObject({ met: 3, keptInTouch: 2, inTouchNow: 1, movedForward: 1, won: 1 });
    expect(r.people.map((p) => [p.name, p.touchesSince, p.inTouch])).toEqual([
      ["Kwame", 1, false],
      ["Ada", 1, true],
      ["Tola", 0, false],
    ]);
  });
});
