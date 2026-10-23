import { describe, expect, it } from "vitest";
import { addDays, addMonths, diffDays, formatLongDate, isIsoDate, todayIn, weekday } from "./dates";

describe("dates", () => {
  it("validates ISO dates, including impossible days", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-2-1")).toBe(false);
    expect(isIsoDate(20260201)).toBe(false);
  });

  it("gives today's date in the named zone, not the server's", () => {
    const instant = new Date("2026-10-23T23:30:00Z");
    expect(todayIn("Africa/Lagos", instant)).toBe("2026-10-24"); // UTC+1
    expect(todayIn("America/New_York", instant)).toBe("2026-10-23");
    expect(todayIn("UTC", instant)).toBe("2026-10-23");
  });

  it("adds days across month, year and leap boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30"); // EU DST change has no effect on dates
  });

  it("adds months with end-of-month clamping", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("counts days and weekdays", () => {
    expect(diffDays("2026-10-01", "2026-10-23")).toBe(22);
    expect(diffDays("2026-10-23", "2026-10-01")).toBe(-22);
    expect(weekday("2026-10-23")).toBe(5); // Friday
  });

  it("formats long dates in British English", () => {
    expect(formatLongDate("2026-10-23", "2026-01-01")).toBe("Friday 23 October");
    expect(formatLongDate("2027-01-04", "2026-10-23")).toBe("Monday 4 January 2027");
  });
});
