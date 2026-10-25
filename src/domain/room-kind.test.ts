import { describe, expect, it } from "vitest";
import { roomKindFromTitle } from "./room-kind";

describe("roomKindFromTitle", () => {
  it("spots events by their names", () => {
    expect(roomKindFromTitle("Moonshot by TechCabal")).toBeNull();
    expect(roomKindFromTitle("Moonshot Conference 2026")).toBe("conference");
    expect(roomKindFromTitle("Lagos Startup Week: opening")).toBe("conference");
    expect(roomKindFromTitle("Fintech Founders Mixer")).toBe("meetup");
    expect(roomKindFromTitle("Moonshot link up")).toBe("meetup");
    expect(roomKindFromTitle("Founders breakfast")).toBe("dinner");
    expect(roomKindFromTitle("AI Hackathon")).toBe("community");
  });

  it("leaves appointments alone", () => {
    expect(roomKindFromTitle("Lunch with Kemi")).toBeNull();
    expect(roomKindFromTitle("Breakfast with Tunde")).toBeNull();
    expect(roomKindFromTitle("Dentist")).toBeNull();
    expect(roomKindFromTitle("1:1 Ada / Kofi")).toBeNull();
  });
});
