import { describe, expect, it } from "vitest";
import { expandAgenda, formatTime, instantInZone, zonedToInstant, zoneCity, type RoomTiming } from "./zoned";

describe("zoned times", () => {
  it("converts local times to instants across DST changes", () => {
    // London leaves summer time on 25 Oct 2026.
    expect(zonedToInstant("2026-10-23", "09:00", "Europe/London").toISOString()).toBe("2026-10-23T08:00:00.000Z");
    expect(zonedToInstant("2026-10-26", "09:00", "Europe/London").toISOString()).toBe("2026-10-26T09:00:00.000Z");
    expect(zonedToInstant("2026-10-23", "09:00", "Africa/Lagos").toISOString()).toBe("2026-10-23T08:00:00.000Z");
  });

  it("reads instants back in another zone", () => {
    expect(instantInZone(new Date("2026-10-24T00:30:00Z"), "Africa/Lagos")).toEqual({ date: "2026-10-24", time: "01:30" });
    expect(instantInZone(new Date("2026-10-24T00:30:00Z"), "America/New_York")).toEqual({ date: "2026-10-23", time: "20:30" });
  });

  it("formats times and zone names", () => {
    expect(formatTime("18:30")).toBe("6:30pm");
    expect(formatTime("09:00")).toBe("9am");
    expect(formatTime("00:15")).toBe("12:15am");
    expect(zoneCity("America/New_York")).toBe("New York");
  });
});

describe("agenda", () => {
  const room = (r: Partial<RoomTiming> & { id: string; start: string }): RoomTiming => ({ freq: "none", startTime: null, allDay: false, tz: "Africa/Lagos", ...r });

  it("puts a New York evening call on the next morning in Lagos", () => {
    const items = expandAgenda([room({ id: "ny", start: "2026-10-23", startTime: "20:00", tz: "America/New_York" })], "2026-10-24", "2026-10-24", "Africa/Lagos");
    expect(items).toEqual([
      expect.objectContaining({ eventId: "ny", occurrenceOn: "2026-10-23", date: "2026-10-24", time: "01:00", localTimeLabel: "8pm New York" }),
    ]);
  });

  it("keeps all-day rooms on their date and sorts timed ones", () => {
    const items = expandAgenda(
      [
        room({ id: "late", start: "2026-10-24", startTime: "18:00" }),
        room({ id: "early", start: "2026-10-24", startTime: "08:00" }),
        room({ id: "allday", start: "2026-10-24", allDay: true }),
        room({ id: "weekly", start: "2026-10-03", freq: "weekly", startTime: "12:00" }),
      ],
      "2026-10-24",
      "2026-10-24",
      "Africa/Lagos",
    );
    expect(items.map((i) => [i.eventId, i.time])).toEqual([
      ["allday", null],
      ["early", "08:00"],
      ["weekly", "12:00"],
      ["late", "18:00"],
    ]);
  });

  it("follows a London series through the clock change", () => {
    const items = expandAgenda([room({ id: "ldn", start: "2026-10-16", freq: "weekly", startTime: "09:00", tz: "Europe/London" })], "2026-10-20", "2026-11-01", "Africa/Lagos");
    expect(items.map((i) => [i.date, i.time])).toEqual([
      ["2026-10-23", "09:00"],
      ["2026-10-30", "10:00"],
    ]);
  });
});
