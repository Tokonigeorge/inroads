import { describe, expect, it } from "vitest";
import { chatTranscript, parseChat } from "./chat";

describe("parseChat", () => {
  it("reads a WhatsApp export, day first, with the people and the date range", () => {
    const p = parseChat("[12/10/2026, 09:14:02] Adaeze: Coffee next week?\n[13/10/2026, 09:20] Ada: Yes! I'll send the deck first.\nAnd the numbers.\n[14/10/2026, 10:00] Adaeze: 👍");
    expect(p.plain).toBe(false);
    expect(p.participants).toEqual([
      { name: "Adaeze", n: 2 },
      { name: "Ada", n: 1 },
    ]);
    expect(p).toMatchObject({ from: "2026-10-12", to: "2026-10-14" });
    expect(p.msgs[1].text).toBe("Yes! I'll send the deck first.\nAnd the numbers.");
  });

  it("reads month-first exports with am/pm and a dash", () => {
    const p = parseChat("10/12/26, 9:14 AM - Tunde: Good to meet you\n10/13/26, 6:02 PM - Me: Likewise");
    expect(p.msgs.map((m) => m.date)).toEqual(["2026-10-12", "2026-10-13"]);
    expect(p.participants.map((x) => x.name)).toEqual(["Tunde", "Me"]);
  });

  it("reads Telegram's JSON export", () => {
    const json = JSON.stringify({ messages: [{ type: "message", from: "Kemi", date: "2026-09-01T10:00:00", text: ["Hi ", { type: "bold", text: "there" }] }, { type: "service" }, { type: "message", from: "Ada", date: "2026-09-02T08:00:00", text: "Hello" }] });
    const p = parseChat(json);
    expect(p.msgs).toEqual([
      { date: "2026-09-01", sender: "Kemi", text: "Hi there" },
      { date: "2026-09-02", sender: "Ada", text: "Hello" },
    ]);
  });

  it("falls back to plain text, sent as it is", () => {
    const raw = "Hey, it was great meeting you at the mixer. Let's talk next week.";
    const p = parseChat(raw);
    expect(p.plain).toBe(true);
    expect(chatTranscript(p, raw)).toBe(raw);
  });
});
