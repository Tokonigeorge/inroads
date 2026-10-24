import { describe, expect, it } from "vitest";
import { formatPhone, nameKey, normaliseContactLists, normaliseEmail, normalisePhone, whatsappDigits } from "./normalise";

describe("emails", () => {
  it("lowercases, trims and strips mailto:", () => {
    expect(normaliseEmail("  Ada@Kestrel.Example ")).toBe("ada@kestrel.example");
    expect(normaliseEmail("mailto:ADA@x.io")).toBe("ada@x.io");
    expect(normaliseEmail("not an email")).toBeNull();
    expect(normaliseEmail("a@b")).toBeNull();
  });
});

describe("phones", () => {
  it("turns the common Nigerian formats into one E.164 number", () => {
    for (const raw of ["0803 123 4567", "08031234567", "+234 803 123 4567", "234 803 123 4567", "002348031234567", "(0803) 123-4567"]) {
      expect(normalisePhone(raw, "NG"), raw).toBe("+2348031234567");
    }
  });

  it("uses the profile region for local numbers and respects explicit country codes", () => {
    expect(normalisePhone("020 7946 0958", "GB")).toBe("+442079460958");
    expect(normalisePhone("+233 24 412 3456", "NG")).toBe("+233244123456");
    expect(normalisePhone("024 412 3456", "GH")).toBe("+233244123456");
  });

  it("rejects things that aren't phone numbers", () => {
    expect(normalisePhone("1234", "NG")).toBeNull();
    expect(normalisePhone("call me", "NG")).toBeNull();
    expect(normalisePhone("", "NG")).toBeNull();
  });

  it("formats for display and for WhatsApp links", () => {
    expect(formatPhone("+2348031234567")).toBe("+234 803 123 4567");
    expect(whatsappDigits("+2348031234567")).toBe("2348031234567");
  });
});

describe("contact lists", () => {
  it("dedupes after normalising and reports what it couldn't read", () => {
    const r = normaliseContactLists({ emails: ["A@x.io", "a@x.io", "nope"], phones: ["0803 123 4567", "+2348031234567", "12"] }, "NG");
    expect(r.emails).toEqual(["a@x.io"]);
    expect(r.phones).toEqual(["+2348031234567"]);
    expect(r.invalid).toEqual([
      { field: "emails", value: "nope" },
      { field: "phones", value: "12" },
    ]);
  });
});

describe("name keys", () => {
  it("ignore case, accents and punctuation", () => {
    expect(nameKey("  Adaéze  O'Kafor ")).toBe("adaeze o kafor");
  });
});
