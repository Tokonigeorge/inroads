import { describe, expect, it } from "vitest";
import { briefPerson, eventBlock, identityRules, meBlock, personBlock, profileUsed, relationshipLine, talkingPointsFrom, webRules } from "./blocks";
import type { PersonContext } from "./space-context";

const TODAY = "2026-10-26";

function person(over: { identity?: Partial<PersonContext["identity"]>; relationship?: Partial<PersonContext["relationship"]> } & Partial<Omit<PersonContext, "identity" | "relationship">> = {}): PersonContext {
  return {
    identity: { id: "p1", name: "Adaeze Okafor", emails: [], phones: [], company: null, position: null, city: null, birthday: null, socials: {}, lastTouchedOn: null, ...over.identity },
    relationship: { whereMet: null, metOn: null, interests: [], notes: null, opportunities: null, tags: [], starred: false, lastTouchedHereOn: null, sourceNotes: null, ...over.relationship },
    touches: over.touches ?? [],
    promises: over.promises ?? [],
    goals: over.goals ?? [],
    // The loader returns null when there is no research (its inferred type misses that).
    research: (over.research ?? null) as PersonContext["research"],
  };
}

describe("personBlock", () => {
  it("labels socials and expands handles into links, as the prototype's contactBlock does", () => {
    const text = personBlock(person({ identity: { socials: { linkedin: "adaeze-okafor", x: "@adaeze", website: "https://kestrel.example" } } }), { today: TODAY });
    expect(text).toContain("Social profiles and handles:\n- LinkedIn: adaeze-okafor (link: https://www.linkedin.com/in/adaeze-okafor)\n- X: @adaeze (link: https://x.com/adaeze)\n- Website: https://kestrel.example");
    expect(text).not.toContain("(link: https://kestrel.example)");
  });

  it("puts the first email first, the rest on an Other emails line, and the first work domain", () => {
    const text = personBlock(person({ identity: { emails: ["ada@gmail.com", "ada@kestrel.example", "a.okafor@yahoo.com"] } }), { today: TODAY });
    expect(text).toContain("Email: ada@gmail.com (work domain: kestrel.example)");
    expect(text).toContain("Other emails: ada@kestrel.example, a.okafor@yahoo.com");
    expect(personBlock(person({ identity: { emails: ["ada@gmail.com"] } }), { today: TODAY })).toContain("Email: ada@gmail.com\n");
  });

  it("formats the birthday and states warmth with days since the last contact", () => {
    const text = personBlock(person({ identity: { birthday: "03-14", lastTouchedOn: "2026-10-04" } }), { today: TODAY });
    expect(text).toContain("Birthday: 14 Mar");
    expect(text).toContain("Relationship: Warm, last contact 22 days ago");
    expect(text).not.toContain("Last contact:");
    expect(personBlock(person(), { today: TODAY })).toContain("Relationship: No touches yet");
  });

  it("gives the full earlier-research line only with history", () => {
    const p = person({
      research: {
        version: 2,
        mode: "full",
        createdAt: new Date("2026-10-01T10:00:00Z"),
        payload: { summary: "Seed investor.", identity: "Adaeze Okafor, Partner at Kestrel", profiles: { linkedin: "https://www.linkedin.com/in/adaeze" }, answeredFrom: "knowledge" },
        sources: Array.from({ length: 7 }, (_, i) => ({ title: `s${i}`, url: `https://s${i}.example` })),
      },
    });
    const text = personBlock(p, { history: true, today: TODAY });
    expect(text).toContain(
      "Earlier research (2026-10-01, from model knowledge only): Seed investor. | Identity: Adaeze Okafor, Partner at Kestrel | Profiles found then: https://www.linkedin.com/in/adaeze | Sources then: https://s0.example, https://s1.example, https://s2.example, https://s3.example, https://s4.example",
    );
    expect(text).not.toContain("s5.example");
    expect(text).not.toContain("Claude");
    expect(personBlock(p, { today: TODAY })).not.toContain("Earlier research");
    // Older dossiers (no answeredFrom) came from the web; example dossiers never count.
    const web = person({ research: { version: 1, mode: "full", createdAt: new Date("2026-10-01T10:00:00Z"), payload: { summary: "VC" }, sources: [] } });
    expect(personBlock(web, { history: true, today: TODAY })).toContain("Earlier research (2026-10-01, from the web): VC");
    const example = person({ research: { version: 1, mode: "example", createdAt: new Date(), payload: { summary: "VC" }, sources: [] } });
    expect(personBlock(example, { history: true, today: TODAY })).not.toContain("Earlier research");
  });

  it("labels who owes whom", () => {
    const text = personBlock(person({ promises: [{ text: "Send the deck", owner: "me", due: "2026-10-30" }, { text: "Intro to Tunde", owner: "them", due: null }] }), { today: TODAY });
    expect(text).toContain("- I owe them: Send the deck (due 2026-10-30)\n- They owe me: Intro to Tunde");
  });
});

describe("relationshipLine", () => {
  it("uses the warmth ring's bands", () => {
    expect(relationshipLine("2026-10-20", TODAY)).toBe("Relationship: Hot, last contact 6 days ago");
    expect(relationshipLine("2026-08-20", TODAY)).toBe("Relationship: Cooling, last contact 67 days ago");
    expect(relationshipLine("2025-01-01", TODAY)).toMatch(/^Relationship: Cold, last contact \d+ days ago$/);
  });
});

describe("profileUsed", () => {
  it("lists the saved details a run could draw on", () => {
    const p = person({
      identity: { position: "Partner", company: "Kestrel", emails: ["a@k.example", "b@k.example"], socials: { linkedin: "ada" } },
      relationship: { whereMet: "Moonshot", notes: "x" },
      touches: [{ date: "2026-10-01", type: "call", summary: "" }],
    });
    expect(profileUsed(p)).toEqual(["role", "company", "email", "other emails", "LinkedIn", "where you met", "notes", "1 interaction"]);
  });
});

describe("briefPerson", () => {
  it("has the prototype's person() shape: dossier, three talking points, labelled promises, interests", () => {
    const p = person({
      identity: { position: "Partner", company: "Kestrel" },
      relationship: { interests: ["fintech"] },
      touches: [{ date: "2026-10-20", type: "call", summary: "Talked pricing" }],
      promises: [
        { text: "Send the deck", owner: "me", due: null },
        { text: "Intro to Tunde", owner: "them", due: null },
      ],
      research: { version: 1, mode: "full", createdAt: new Date(), payload: { summary: "Seed investor.", talkingPoints: ["a", "b", "c", "d"] }, sources: [] },
    });
    expect(briefPerson(p)).toEqual({
      name: "Adaeze Okafor",
      role: "Partner · Kestrel",
      lastInteraction: { date: "2026-10-20", summary: "Talked pricing" },
      dossier: "Seed investor.",
      talkingPoints: ["a", "b", "c"],
      openPromises: ["I owe: Send the deck", "they owe: Intro to Tunde"],
      interests: ["fintech"],
    });
    expect(briefPerson(person())).toMatchObject({ role: "No role added yet", lastInteraction: null, dossier: "", talkingPoints: [] });
  });

  it("reads Get to know questions as talking points", () => {
    expect(talkingPointsFrom({ thingsToAsk: [{ text: "Best gig?", url: "" }] })).toEqual(["Best gig?"]);
  });
});

describe("eventBlock", () => {
  it("describes a room on my list with its next dates and linked people", () => {
    const text = eventBlock(
      {
        title: "Lagos Fintech Breakfast",
        kind: "meetup",
        startsOn: "2026-09-01",
        startTime: "08:00:00",
        recurrence: { freq: "weekly", byDays: [2] },
        location: "Ikoyi",
        url: "https://luma.example/breakfast",
        notes: "Arrive early",
        people: [{ name: "Kemi", company: "Kestrel" }, { name: "Tunde", company: null }],
      },
      TODAY,
    );
    expect(text).toBe(
      [
        "Title: Lagos Fintech Breakfast",
        "Type: Meetup",
        "Repeats: Every week on Tue",
        "First date: 2026-09-01 08:00",
        "Next dates: 2026-10-27, 2026-11-03, 2026-11-10",
        "Location: Ikoyi",
        "Event page: https://luma.example/breakfast",
        "My notes: Arrive early",
        "People from my network linked to it: Kemi (Kestrel); Tunde",
      ].join("\n"),
    );
  });
});

describe("web and identity rules", () => {
  it("has a knowledge-mode variant that drops the tool instructions", () => {
    expect(webRules("web", "x")).toMatch(/^LIVE WEB/);
    expect(webRules("knowledge", "x")).toMatch(/^NO WEB ACCESS in this run/);
    expect(identityRules("web")).toContain("Open every saved profile link first with web_fetch");
    expect(identityRules("knowledge")).not.toContain("web_fetch");
    expect(identityRules("knowledge")).toContain("USE EVERYTHING I'VE SAVED");
  });
});

describe("meBlock", () => {
  const space = { space: { id: "s1", name: "Work", kind: "work" as const }, researchMode: "auto" as never, goals: [] };
  const me = { name: "Bukola", headline: null, location: "Lagos", background: null, offerings: null, industries: [], aiNotes: null, timezone: "Africa/Lagos" };

  it("passes Notes for Inroads as a preference, not a rule", () => {
    const text = meBlock({ ...me, aiNotes: "Prefer online and small things." }, space);
    expect(text).toContain("My notes for you (preferences, not rules: follow them most of the time, but keep some variety");
    expect(text).toContain("Prefer online and small things.");
    expect(meBlock(me, space)).not.toContain("My notes for you");
  });
});
