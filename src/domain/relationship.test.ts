import { describe, expect, it } from "vitest";
import { dueOn, dueState, effectiveCadence, personCadence, sinceLabel, strength, warmth } from "./relationship";

describe("warmth", () => {
  const today = "2026-10-24";
  it("labels time since the last touch in plain words", () => {
    expect(warmth(null, today)).toEqual({ key: "none", days: null, label: "No touches yet" });
    expect(warmth("2026-10-24", today)).toMatchObject({ key: "recent", label: "Today" });
    expect(warmth("2026-10-10", today)).toMatchObject({ key: "recent", days: 14, label: "2 weeks ago" });
    expect(warmth("2026-09-09", today)).toMatchObject({ key: "warm", days: 45 });
    expect(warmth("2026-07-26", today)).toMatchObject({ key: "cooling", days: 90, label: "3 months ago" });
    expect(warmth("2025-01-01", today)).toMatchObject({ key: "cold", label: "Over a year ago" });
  });
  it("never goes negative for future-dated touches", () => {
    expect(warmth("2026-11-01", today).days).toBe(0);
  });
  it("has readable labels at the boundaries", () => {
    expect(sinceLabel(1)).toBe("Yesterday");
    expect(sinceLabel(13)).toBe("13 days ago");
    expect(sinceLabel(59)).toBe("8 weeks ago");
  });
});

describe("cadence", () => {
  it("takes the person's setting, then the circle's, then the Space's", () => {
    expect(effectiveCadence(14, 30, 60)).toBe(14);
    expect(effectiveCadence(null, 30, 60)).toBe(30);
    expect(effectiveCadence(null, null, 60)).toBe(60);
    expect(effectiveCadence(null, null, null)).toBeNull();
  });
  it("treats 0 as never, even when a circle or Space has a default", () => {
    expect(effectiveCadence(0, 30, 60)).toBeNull();
    expect(effectiveCadence(null, 0, 60)).toBeNull();
  });
  it("uses the shortest reminder across a person's Spaces", () => {
    expect(personCadence([30, null, 7])).toBe(7);
    expect(personCadence([null, null])).toBeNull();
  });
});

describe("due dates", () => {
  it("counts from the last touch, else from triage, else from when they were added", () => {
    expect(dueOn({ lastTouchedOn: "2026-10-01", anchorOn: "2026-09-01", createdOn: "2026-01-01", cadenceDays: 30 })).toBe("2026-10-31");
    expect(dueOn({ lastTouchedOn: null, anchorOn: "2026-09-01", createdOn: "2026-01-01", cadenceDays: 30 })).toBe("2026-10-01");
    expect(dueOn({ lastTouchedOn: null, anchorOn: null, createdOn: "2026-10-01", cadenceDays: 14 })).toBe("2026-10-15");
    expect(dueOn({ lastTouchedOn: "2026-10-01", anchorOn: null, createdOn: "2026-10-01", cadenceDays: null })).toBeNull();
  });
  it("describes due and overdue states", () => {
    expect(dueState("2026-10-25", "2026-10-24")).toMatchObject({ due: false, label: "Due tomorrow" });
    expect(dueState("2026-10-24", "2026-10-24")).toMatchObject({ due: true, label: "Due today" });
    expect(dueState("2026-10-20", "2026-10-24")).toMatchObject({ due: true, overdueDays: 4, label: "4 days overdue" });
    expect(dueState(null, "2026-10-24")).toBeNull();
  });
});

describe("strength", () => {
  const today = "2026-10-24";
  it("is recency and frequency together, 0–100, with a plain label and why", () => {
    expect(strength({ lastTouchedOn: null, touches: 0, today })).toBeNull();
    expect(strength({ lastTouchedOn: today, touches: 6, today })).toEqual({ value: 100, label: "Strong", why: "6 touches in 6 months, last today" });
    // One chat today is a good start, not yet a strong relationship.
    expect(strength({ lastTouchedOn: today, touches: 1, today })).toMatchObject({ value: 63, label: "Good" });
    expect(strength({ lastTouchedOn: "2026-10-10", touches: 2, today })).toMatchObject({ value: 61, label: "Good" });
    expect(strength({ lastTouchedOn: "2026-07-26", touches: 1, today })).toMatchObject({ value: 24, label: "Fading" });
    expect(strength({ lastTouchedOn: "2025-10-24", touches: 0, today })).toMatchObject({ value: 0, label: "Weak", why: "No touches in 6 months, last over a year ago" });
  });
});
