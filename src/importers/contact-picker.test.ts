import { describe, expect, it } from "vitest";
import { mapPickedContacts } from "./contact-picker";

describe("mapPickedContacts", () => {
  it("normalises emails and phones using the profile region", () => {
    const [c] = mapPickedContacts([{ name: ["Kemi Adebayo"], email: ["Kemi@Example.com", "kemi@example.com"], tel: ["0803 123 4567", "+234 803 123 4567"] }], "NG");
    expect(c).toMatchObject({ name: "Kemi Adebayo", hasName: true, emails: ["kemi@example.com"], phones: ["+2348031234567"], externalId: null });
  });

  it("uses the number as the name when there is none, and flags it", () => {
    const [c] = mapPickedContacts([{ name: [" "], email: [], tel: ["08031234567"] }], "NG");
    expect(c).toMatchObject({ name: "+2348031234567", hasName: false });
  });

  it("drops entries with nothing usable", () => {
    expect(mapPickedContacts([{ name: [], email: ["not an email"], tel: ["abc"] }], "NG")).toEqual([]);
  });
});
