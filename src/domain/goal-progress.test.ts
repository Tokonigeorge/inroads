import { describe, expect, it } from "vitest";
import { classifyMoves, firstOpenStage, progressMeter, progressSummary, weekOf } from "./goal-progress";

const stages = [
  { key: "identified", label: "Identified" },
  { key: "warm_path", label: "Warm path found" },
  { key: "met", label: "Met" },
  { key: "won", label: "Won", closed: true },
  { key: "closed", label: "Closed", closed: true },
];

describe("weekOf", () => {
  it("runs Monday to Sunday", () => {
    expect(weekOf("2026-10-24")).toEqual({ start: "2026-10-19", end: "2026-10-25" }); // Saturday
    expect(weekOf("2026-10-19")).toEqual({ start: "2026-10-19", end: "2026-10-25" }); // Monday
    expect(weekOf("2026-10-25")).toEqual({ start: "2026-10-19", end: "2026-10-25" }); // Sunday
  });
  it("crosses month and year ends", () => {
    expect(weekOf("2027-01-01")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
  });
});

describe("classifyMoves", () => {
  it("separates forward, back, won and closed, and ignores being added", () => {
    const r = classifyMoves(
      [
        { from: null, to: "identified" },
        { from: "identified", to: "met" },
        { from: "met", to: "warm_path" },
        { from: "met", to: "won" },
        { from: "warm_path", to: "closed" },
        { from: "gone", to: "met" },
        { from: "met", to: "met" },
      ],
      stages,
    );
    expect(r).toEqual({ forward: 1, back: 1, won: 1, closed: 1 });
  });
  it("re-opening a closed person counts as back", () => {
    expect(classifyMoves([{ from: "won", to: "met" }], stages)).toEqual({ forward: 0, back: 1, won: 0, closed: 0 });
  });
});

describe("progressMeter", () => {
  it("counts touches and rooms against the target", () => {
    expect(progressMeter({ touches: 1, rooms: 1, target: 3 })).toEqual({ done: 2, target: 3, ratio: 2 / 3, label: "1 to go" });
    expect(progressMeter({ touches: 5, rooms: 0, target: 3 })).toMatchObject({ ratio: 1, label: "On track" });
  });
  it("never divides by zero", () => {
    expect(progressMeter({ touches: 0, rooms: 0, target: 0 }).ratio).toBe(0);
  });
});

describe("progressSummary", () => {
  it("reads as a sentence", () => {
    expect(progressSummary({ touches: 4, peopleTouched: 3, rooms: 1, moves: { forward: 2, back: 0, won: 1, closed: 0 }, target: 3 })).toBe(
      "4 touches with 3 people · 1 room · 2 moved forward · 1 won",
    );
    expect(progressSummary({ touches: 0, peopleTouched: 0, rooms: 0, moves: { forward: 0, back: 0, won: 0, closed: 0 }, target: 3 })).toBe("No touches yet");
  });
});

describe("firstOpenStage", () => {
  it("skips closed stages", () => {
    expect(firstOpenStage([{ key: "won", label: "Won", closed: true }, ...stages]).key).toBe("identified");
  });
});
