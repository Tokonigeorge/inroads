import { describe, expect, it } from "vitest";
import { meetingsEndedBetween, wrapUpDue, type TimedRoom, promisesDueBetween } from "./notify";

const room = (over: Partial<TimedRoom> = {}): TimedRoom => ({
  id: "r1",
  title: "Pitch with Kemi",
  start: "2026-11-02",
  freq: "none",
  startTime: "15:00",
  endTime: "17:00",
  allDay: false,
  tz: "Africa/Lagos",
  ...over,
});

// Lagos is UTC+1: 17:00 there is 16:00 UTC.
const at = (iso: string) => new Date(iso);

describe("meetings that just ended", () => {
  it("finds a meeting whose end falls in the window", () => {
    const ended = meetingsEndedBetween([room()], at("2026-11-02T15:50:00Z"), at("2026-11-02T16:05:00Z"));
    expect(ended.map((e) => [e.title, e.occurrenceOn, e.endsAt.toISOString()])).toEqual([["Pitch with Kemi", "2026-11-02", "2026-11-02T16:00:00.000Z"]]);
  });

  it("skips meetings that ended earlier, haven't ended, are all-day or on another day", () => {
    const window = [at("2026-11-02T15:50:00Z"), at("2026-11-02T16:05:00Z")] as const;
    expect(meetingsEndedBetween([room({ endTime: "16:00" })], ...window)).toEqual([]);
    expect(meetingsEndedBetween([room({ endTime: "18:00" })], ...window)).toEqual([]);
    expect(meetingsEndedBetween([room({ allDay: true, startTime: null })], ...window)).toEqual([]);
    expect(meetingsEndedBetween([room({ start: "2026-11-03" })], ...window)).toEqual([]);
  });

  it("takes an hour when there's no end time, and handles weekly series", () => {
    const weekly = room({ start: "2026-10-26", freq: "weekly", startTime: "16:00", endTime: null });
    expect(meetingsEndedBetween([weekly], at("2026-11-02T15:55:00Z"), at("2026-11-02T16:10:00Z")).map((e) => e.occurrenceOn)).toEqual(["2026-11-02"]);
  });
});

describe("wrap-up", () => {
  const base = { tz: "Africa/Lagos", time: "18:00", everyDays: 1, lastSentOn: null };

  it("is due in the half hour after your chosen time", () => {
    expect(wrapUpDue({ ...base, now: at("2026-11-02T17:10:00Z") })).toBe("2026-11-02");
    expect(wrapUpDue({ ...base, now: at("2026-11-02T16:50:00Z") })).toBeNull();
    expect(wrapUpDue({ ...base, now: at("2026-11-02T17:31:00Z") })).toBeNull();
  });

  it("respects how often you asked for it, and off", () => {
    const now = at("2026-11-02T17:05:00Z");
    expect(wrapUpDue({ ...base, now, lastSentOn: "2026-11-02" })).toBeNull();
    expect(wrapUpDue({ ...base, now, everyDays: 2, lastSentOn: "2026-11-01" })).toBeNull();
    expect(wrapUpDue({ ...base, now, everyDays: 2, lastSentOn: "2026-10-31" })).toBe("2026-11-02");
    expect(wrapUpDue({ ...base, now, everyDays: 0 })).toBeNull();
  });
});

describe("promisesDueBetween", () => {
  const p = { id: "p1", text: "Send the deck", dueOn: "2026-11-03", dueTime: "14:30:00", personId: "x", name: "Kemi" };
  it("uses your time zone", () => {
    // 14:30 in Lagos (UTC+1) is 13:30 UTC; in London on 3 November (UTC+0) it's 14:30 UTC.
    expect(promisesDueBetween([p], "Africa/Lagos", new Date("2026-11-03T13:20:00Z"), new Date("2026-11-03T13:35:00Z"))).toHaveLength(1);
    expect(promisesDueBetween([p], "Europe/London", new Date("2026-11-03T13:20:00Z"), new Date("2026-11-03T13:35:00Z"))).toHaveLength(0);
  });
});
