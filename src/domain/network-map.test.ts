import { describe, expect, it } from "vitest";
import { layoutNetwork, radiusFor, unit } from "./network-map";

const p = (id: string, strength: number | null, goalId: string | null = null) => ({ id, name: id, strength, starred: false, goalId });

describe("network map layout", () => {
  it("puts stronger relationships closer, and people with no touches on the edge", () => {
    expect(radiusFor(100)).toBeCloseTo(0.2);
    expect(radiusFor(0)).toBeCloseTo(0.9);
    expect(radiusFor(null)).toBeCloseTo(0.97);
    expect(radiusFor(80)).toBeLessThan(radiusFor(30));
  });

  it("is stable: the same people land in the same place", () => {
    const people = [p("a", 80, "g1"), p("b", 30, "g1"), p("c", null)];
    expect(layoutNetwork(people, [{ id: "g1", text: "Raise" }])).toEqual(layoutNetwork(people, [{ id: "g1", text: "Raise" }]));
    expect(unit("abc")).toBe(unit("abc"));
  });

  it("keeps everyone inside the circle and each goal's people together", () => {
    const goals = [
      { id: "g1", text: "Raise" },
      { id: "g2", text: "Hire" },
    ];
    const people = [p("a", 90, "g1"), p("b", 50, "g1"), p("c", 20, "g2"), p("d", null, "g2"), p("e", 60), p("f", 40, "gone")];
    const placed = layoutNetwork(people, goals);
    expect(placed).toHaveLength(6);
    for (const x of placed) expect(Math.hypot(x.x, x.y)).toBeLessThan(1);
    const angle = (id: string) => {
      const q = placed.find((x) => x.id === id)!;
      return (Math.atan2(q.y, q.x) + 2.5 * Math.PI) % (2 * Math.PI);
    };
    // Slices go goal 1, goal 2, then no goal (a goal not on the list counts as none).
    expect(Math.max(angle("a"), angle("b"))).toBeLessThan(Math.min(angle("c"), angle("d")));
    expect(Math.max(angle("c"), angle("d"))).toBeLessThan(Math.min(angle("e"), angle("f")));
  });

  it("returns nothing for nobody", () => {
    expect(layoutNetwork([], [])).toEqual([]);
  });
});
