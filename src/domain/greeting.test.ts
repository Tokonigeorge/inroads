import { describe, expect, it } from "vitest";
import { greeting, hourIn } from "./greeting";

const base = { firstName: "Ada", hour: 9, today: "2026-10-25", todayRooms: [], weekRooms: [], followUps: 0 };

describe("greeting", () => {
  it("says hello for the time of day", () => {
    expect(greeting({ ...base, hour: 3 }).hello).toBe("Working late, Ada.");
    expect(greeting({ ...base, hour: 9 }).hello).toBe("Good morning, Ada.");
    expect(greeting({ ...base, hour: 14 }).hello).toBe("Good afternoon, Ada.");
    expect(greeting({ ...base, hour: 20, firstName: "" }).hello).toBe("Good evening.");
  });

  it("names what's ahead: today first, then the week, then follow-ups", () => {
    expect(greeting({ ...base, todayRooms: ["Fintech Mixer"] }).ahead).toBe("Fintech Mixer is today.");
    expect(greeting({ ...base, todayRooms: ["A", "B"] }).ahead).toBe("2 rooms today, starting with A.");
    expect(greeting({ ...base, weekRooms: [{ title: "Moonshot", date: "2026-10-28" }] }).ahead).toBe("Coming up: Moonshot on Wednesday.");
    expect(greeting({ ...base, weekRooms: [{ title: "Moonshot", date: "2026-10-26" }, { title: "B", date: "2026-10-29" }] }).ahead).toBe("Big week: Moonshot tomorrow, and 1 more room.");
    expect(greeting({ ...base, followUps: 3 }).ahead).toBe("3 things to follow up on.");
    expect(greeting(base).ahead).toMatch(/^A quiet day/);
  });

  it("reads the hour in a time zone", () => {
    expect(hourIn("Africa/Lagos", new Date("2026-10-25T23:30:00Z"))).toBe(0);
    expect(hourIn("UTC", new Date("2026-10-25T09:10:00Z"))).toBe(9);
  });
});
