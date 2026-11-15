import { describe, expect, it } from "vitest";
import { briefMessage, type Segment } from "./brief-message";

const plain = (s: Segment[]) => s.map((x) => (x.bold ? `**${x.text}**` : x.text)).join("");

describe("briefMessage", () => {
  it("leads with the meeting with someone you know, and the most urgent promise", () => {
    const s = briefMessage({
      meetings: [
        { title: "Focus block", time: "09:00", person: null },
        { title: "Pricing review", time: "18:00", person: "Tunde Bakare" },
      ],
      promises: [{ person: "Chidera Udeh", overdue: false }],
      others: 2,
    });
    expect(plain(s)).toBe("Two things matter today: **Tunde at 18:00**, and what you promised **Chidera**. Three more things are waiting for you.");
  });

  it("says when a promise is overdue, and copes with one thing", () => {
    expect(plain(briefMessage({ meetings: [], promises: [{ person: "Kemi", overdue: true }], others: 0 }))).toBe(
      "One thing matters most today: the overdue promise to **Kemi**.",
    );
  });

  it("names a meeting with no one linked by its title, and formats the time", () => {
    expect(plain(briefMessage({ meetings: [{ title: "N&S weekly", time: "21:00", person: null }], promises: [], others: 0 }, () => "9pm"))).toBe(
      "One thing matters most today: **N&S weekly at 9pm**.",
    );
  });

  it("is calm when only small things are waiting, and when nothing is", () => {
    expect(plain(briefMessage({ meetings: [], promises: [], others: 1 }))).toContain("One person needs a nudge today.");
    expect(plain(briefMessage({ meetings: [], promises: [], others: 0 }))).toContain("A good day to reach out");
  });
});
