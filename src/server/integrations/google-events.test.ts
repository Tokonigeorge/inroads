import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { mapGoogleEvent } = await import("./google");

const base = { id: "e1", summary: "Pricing review", start: { dateTime: "2026-11-03T10:00:00+01:00" }, end: { dateTime: "2026-11-03T11:00:00+01:00" } };

describe("mapGoogleEvent", () => {
  it("keeps meetings", () => {
    expect(mapGoogleEvent(base, "Africa/Lagos")).toMatchObject({ uid: "e1", summary: "Pricing review", start: { date: "2026-11-03", time: "10:00" } });
  });

  it("drops Google's own blocks: out of office, focus time, working location, birthdays", () => {
    for (const eventType of ["outOfOffice", "focusTime", "workingLocation", "birthday"]) expect(mapGoogleEvent({ ...base, eventType }, "Africa/Lagos")).toBeNull();
    expect(mapGoogleEvent({ ...base, eventType: "default" }, "Africa/Lagos")).not.toBeNull();
  });
});
