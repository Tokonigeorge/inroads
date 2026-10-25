import { describe, expect, it } from "vitest";
import { buildNudges, MAX_NUDGES, nextBirthday, nudgeStateFor, relativeDay, type NudgeSnapshot } from "./nudges";

const today = "2026-10-24"; // Saturday
const kemi = { id: "p-kemi", name: "Kemi Adebayo", detail: "Partner at Kestrel" };
const tunde = { id: "p-tunde", name: "Tunde Bakare", detail: "" };

const empty = (): NudgeSnapshot => ({ today, birthdays: [], due: [], owed: [], owedToMe: [], meetings: [], needContext: [], rooms: [], triagePending: 0, hidden: new Set() });
const keys = (s: Partial<NudgeSnapshot>) => buildNudges({ ...empty(), ...s }).map((n) => n.key);

describe("nextBirthday", () => {
  it("rolls into next year and handles 29 February", () => {
    expect(nextBirthday("10-24", today)).toBe("2026-10-24");
    expect(nextBirthday("01-05", today)).toBe("2027-01-05");
    expect(nextBirthday("02-29", "2027-02-01")).toBe("2027-02-28");
    expect(nextBirthday("02-29", "2028-02-01")).toBe("2028-02-29");
    expect(nextBirthday("nope", today)).toBeNull();
  });
});

describe("relativeDay", () => {
  it("says today, tomorrow, a weekday, then a date", () => {
    expect(relativeDay("2026-10-24", today)).toBe("today");
    expect(relativeDay("2026-10-25", today)).toBe("tomorrow");
    expect(relativeDay("2026-10-29", today)).toBe("on Thursday");
    expect(relativeDay("2026-11-05", today)).toBe("on Thursday 5 November");
  });
});

describe("buildNudges", () => {
  it("birthdays within a week, dated keys so next year's isn't hidden", () => {
    const n = buildNudges({ ...empty(), birthdays: [{ ...kemi, birthday: "10-24" }, { ...tunde, birthday: "11-02" }] });
    expect(n.map((x) => [x.key, x.priority, x.title])).toEqual([["bday:p-kemi:2026-10-24", 0, "Kemi Adebayo's birthday is today"]]);
  });

  it("promises you owe: overdue first, due within 3 days or undated, later ones wait", () => {
    const owed = [
      { id: "c1", person: kemi, text: "Send the deck", dueOn: "2026-10-20" },
      { id: "c2", person: tunde, text: "Intro him to Ifeoma", dueOn: null },
      { id: "c3", person: tunde, text: "Share pricing", dueOn: "2026-11-10" },
    ];
    const n = buildNudges({ ...empty(), owed });
    expect(n.map((x) => [x.key, x.label])).toEqual([
      ["p:c1", "Overdue promise"],
      ["p:c2", "Promise"],
    ]);
    expect(n[0].title).toBe("You said you'd send the deck");
    expect(n[0].body).toBe("For Kemi Adebayo, was due 4 days ago.");
  });

  it("promises they owe you show once they're late", () => {
    expect(keys({ owedToMe: [{ id: "t1", person: kemi, text: "Send the term sheet", dueOn: "2026-10-23" }, { id: "t2", person: kemi, text: "x", dueOn: today }] })).toEqual(["them:t1"]);
  });

  it("due for a touch, worded from the last touch and the reminder", () => {
    const [n] = buildNudges({ ...empty(), due: [{ ...kemi, dueOn: "2026-10-20", lastTouchedOn: "2026-09-20", cadenceDays: 30 }] });
    expect(n).toMatchObject({ key: "due:p-kemi:2026-10-20", title: "Last spoke with Kemi Adebayo 5 weeks ago", body: "Partner at Kestrel. You aim to be in touch every month." });
    expect(n.actions.map((a) => a.type)).toEqual(["draft", "log_touch", "snooze", "open_person"]);
  });

  it("meeting someone you haven't researched offers it first; birthdays and due cards offer a draft", () => {
    const [prep] = buildNudges({ ...empty(), meetings: [{ person: kemi, eventId: "e1", title: "Pricing review", date: "2026-10-26", time: null, lastTouch: null, promise: null, spaceId: "s1", researched: false }] });
    expect(prep.actions[0]).toEqual({ type: "research", personId: kemi.id, spaceId: "s1", label: "Research now" });
    const [done] = buildNudges({ ...empty(), meetings: [{ person: kemi, eventId: "e1", title: "Pricing review", date: "2026-10-26", time: null, lastTouch: null, promise: null, spaceId: "s1", researched: true }] });
    expect(done.actions.map((a) => a.type)).toEqual(["open_person", "open_room"]);
  });

  it("a sharper reason replaces the plain 'due' card for the same person", () => {
    const k = keys({
      due: [{ ...kemi, dueOn: "2026-10-20", lastTouchedOn: null, cadenceDays: 30 }],
      meetings: [{ person: kemi, eventId: "e1", title: "Pricing review", date: "2026-10-26", time: "17:30", lastTouch: null, promise: "Send the deck" }],
    });
    expect(k).toEqual(["prep:p-kemi:e1:2026-10-26"]);
  });

  it("prep cards for meetings in the next 3 days carry the last touch and what you owe", () => {
    const [n] = buildNudges({
      ...empty(),
      meetings: [{ person: kemi, eventId: "e1", title: "Pricing review", date: "2026-10-25", time: "17:30", lastTouch: { on: "2026-10-01", summary: "Coffee in Ikoyi" }, promise: "Send the deck" }],
    });
    expect(n.title).toBe("You meet Kemi tomorrow at 5:30pm: Pricing review");
    expect(n.body).toBe("Last spoke Thursday 1 October: Coffee in Ikoyi. You owe them: send the deck.");
    expect(keys({ meetings: [{ person: kemi, eventId: "e1", title: "x", date: "2026-10-28", time: null, lastTouch: null, promise: null }] })).toEqual([]);
  });

  it("rooms from tomorrow to a week out; context for recent additions; one triage card a day", () => {
    expect(
      keys({
        rooms: [
          { eventId: "r1", title: "Founders Breakfast", date: "2026-10-29", time: "08:00", location: "Ikoyi" },
          { eventId: "r2", title: "Too far", date: "2026-11-02", time: null, location: null },
          { eventId: "r3", title: "Today", date: today, time: null, location: null },
        ],
        needContext: [
          { ...kemi, createdOn: "2026-10-20" },
          { ...tunde, createdOn: "2026-09-01" },
        ],
        triagePending: 840,
      }),
    ).toEqual(["triage:2026-10-24", "ev:r1:2026-10-29", "ctx:p-kemi"]);
    const [t] = buildNudges({ ...empty(), triagePending: 840 });
    expect(t).toMatchObject({ title: "Sort 5 new people", body: "840 waiting from your imports. About 20 seconds." });
  });

  it("hides snoozed or dismissed keys and caps the feed", () => {
    expect(keys({ birthdays: [{ ...kemi, birthday: "10-24" }], hidden: new Set(["bday:p-kemi:2026-10-24"]) })).toEqual([]);
    const due = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, name: `P ${i}`, detail: "", dueOn: today, lastTouchedOn: null, cadenceDays: 30 }));
    expect(buildNudges({ ...empty(), due })).toHaveLength(MAX_NUDGES);
  });
});

describe("nudgeStateFor", () => {
  const now = new Date("2026-10-24T09:00:00Z");
  it("snooze hides until a time and then expires", () => {
    expect(nudgeStateFor("due:p:2026-10-20", { type: "snooze", days: 14 }, now)).toEqual({
      snoozedUntil: new Date("2026-11-07T09:00:00Z"),
      dismissedAt: null,
      expiresAt: new Date("2026-11-07T09:00:00Z"),
    });
  });
  it("dismissing a dated key keeps the row 30 days past that date; undated ones 180 days", () => {
    expect(nudgeStateFor("bday:p:2026-10-24", { type: "dismiss" }, now).expiresAt).toEqual(new Date("2026-11-23T00:00:00Z"));
    expect(nudgeStateFor("ctx:p", { type: "dismiss" }, now).expiresAt).toEqual(new Date("2027-04-22T09:00:00Z"));
  });
  it("after a room: asks who you met for sessions 1-2 days ago, first thing, with a dated key", () => {
    const afterRooms = [
      { eventId: "e1", title: "Ikoyi Founders Mixer", date: "2026-10-23", occurrenceOn: "2026-10-23", people: 2 },
      { eventId: "e2", title: "Fintech Breakfast", date: "2026-10-22", occurrenceOn: "2026-10-22", people: 0 },
      { eventId: "e3", title: "Too old", date: "2026-10-21", occurrenceOn: "2026-10-21", people: 0 },
      { eventId: "e4", title: "Today", date: today, occurrenceOn: today, people: 0 },
    ];
    const n = buildNudges({ ...empty(), afterRooms });
    expect(n.map((x) => x.key)).toEqual(["after:e1:2026-10-23", "after:e2:2026-10-22"]);
    expect(n[0]).toMatchObject({ kind: "after_room", priority: 1, title: "Who did you meet at Ikoyi Founders Mixer?" });
    expect(n[0].body).toMatch(/^Yesterday\. .*2 people are already linked/);
    expect(n[0].actions[0]).toEqual({ type: "debrief_room", eventId: "e1", occurrenceOn: "2026-10-23", label: "Who I met" });
    expect(keys({ afterRooms, hidden: new Set(["after:e1:2026-10-23"]) })).toEqual(["after:e2:2026-10-22"]);
  });
});
