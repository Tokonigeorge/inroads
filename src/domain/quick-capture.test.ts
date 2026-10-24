import { describe, expect, it } from "vitest";
import { futureDate, parseQuickCapture } from "./quick-capture";

// Saturday 24 October 2026.
const today = "2026-10-24";

describe("parseQuickCapture", () => {
  it("reads the brief's example", () => {
    expect(parseQuickCapture("Met Ada, partnerships @ Paystack, wants intro to Tola", today)).toEqual({
      name: "Ada",
      company: "Paystack",
      position: "Partnerships",
      touch: {
        type: "meeting",
        occurredOn: today,
        summary: "Met Ada, partnerships @ Paystack, wants intro to Tola",
      },
      promises: [{ text: "Intro to Tola", owner: "me", dueOn: null }],
      followUpOn: null,
    });
  });

  it("finds touch types, past dates and events", () => {
    expect(parseQuickCapture("Coffee with Kwame Mensah yesterday", today).touch).toMatchObject({ type: "coffee", occurredOn: "2026-10-23" });
    expect(parseQuickCapture("Called Ngozi on Tuesday", today).touch).toMatchObject({ type: "call", occurredOn: "2026-10-20" });
    expect(parseQuickCapture("Met Tola Adeyemi at the Ikoyi mixer", today)).toMatchObject({ name: "Tola Adeyemi", touch: { type: "event" } });
    expect(parseQuickCapture("WhatsApped Chidi about the role", today)).toMatchObject({ name: "Chidi", touch: { type: "message" } });
  });

  it("splits promises by who owes them, with due dates", () => {
    const d = parseQuickCapture("Met Tola at the Ikoyi mixer, she wants our deck by Friday, she'll intro me to Bayo next week", today);
    expect(d.promises).toEqual([
      { text: "Send our deck", owner: "me", dueOn: "2026-10-30" },
      { text: "Intro me to Bayo", owner: "them", dueOn: "2026-10-26" },
    ]);
    expect(parseQuickCapture("Lunch with Femi; I'll send the term sheet tomorrow", today).promises).toEqual([{ text: "Send the term sheet", owner: "me", dueOn: "2026-10-25" }]);
  });

  it("reads follow-ups", () => {
    expect(parseQuickCapture("Met Ada, follow up Monday", today).followUpOn).toBe("2026-10-26");
    expect(parseQuickCapture("Saw Kemi Adebayo - ping her in 3 days", today).followUpOn).toBe("2026-10-27");
  });

  it("takes a bare name, roles with 'at', and 'from'", () => {
    expect(parseQuickCapture("Ifeoma, CTO at Kuda", today)).toMatchObject({
      name: "Ifeoma",
      position: "CTO",
      company: "Kuda",
      touch: null,
    });
    expect(parseQuickCapture("Met Segun from Flutterwave", today)).toMatchObject({ name: "Segun", company: "Flutterwave" });
  });

  it("never invents a person from a lowercase line", () => {
    expect(parseQuickCapture("need to send the deck tomorrow", today)).toMatchObject({
      name: null,
      promises: [{ owner: "me", text: "Send the deck", dueOn: "2026-10-25" }],
    });
    expect(parseQuickCapture("", today).name).toBeNull();
  });
});

describe("futureDate", () => {
  it("handles weekdays, 'next', explicit dates and rolling into next year", () => {
    expect(futureDate("by Saturday", today)).toBe(today);
    expect(futureDate("by Monday", today)).toBe("2026-10-26");
    expect(futureDate("next Friday", "2026-10-26")).toBe("2026-11-06");
    expect(futureDate("on 3 Nov", today)).toBe("2026-11-03");
    expect(futureDate("Nov 3rd", today)).toBe("2026-11-03");
    expect(futureDate("by 5/1", today)).toBe("2027-01-05");
    expect(futureDate("nothing here", today)).toBeNull();
  });
});
