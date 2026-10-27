import { describe, expect, it } from "vitest";
import { localPaths, matchCompany, matchEvents, matchPeople, type PersonCandidate } from "./known";

const people: PersonCandidate[] = [
  { id: "1", name: "Adaeze Okafor", company: "Kestrel Ventures", socials: { x: "@adaeze_vc" } },
  { id: "2", name: "Ada Obi", company: "Flutterwave", socials: {} },
  { id: "3", name: "Tunde Bakare", company: "Kestrel", socials: { linkedin: "https://www.linkedin.com/in/tbakare" } },
  { id: "4", name: "Ngozi Eze", company: null, socials: null },
];

describe("matchPeople", () => {
  it("matches a name exactly, or by containment from 5 characters", () => {
    expect(matchPeople("Adaeze Okafor", people).map((p) => p.id)).toEqual(["1"]);
    expect(matchPeople("adaeze", people).map((p) => p.id)).toEqual(["1"]);
    expect(matchPeople("Ada", people)).toEqual([]); // too short to match by containment
    expect(matchPeople("Ádaeze Okafor (Kestrel)", people).map((p) => p.id)).toEqual(["1"]);
  });

  it("matches a saved handle", () => {
    expect(matchPeople("@adaeze_vc", people).map((p) => p.id)).toEqual(["1"]);
    expect(matchPeople("adaeze_vc", people).map((p) => p.id)).toEqual(["1"]);
  });

  it("returns at most three", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: String(i), name: "Kemi Adebayo", company: null, socials: null }));
    expect(matchPeople("Kemi Adebayo", many)).toHaveLength(3);
  });
});

describe("matchCompany", () => {
  it("matches people whose company is in the query or contains it", () => {
    expect(matchCompany("Kestrel Ventures", people).map((p) => p.id)).toEqual(["1", "3"]);
    expect(matchCompany("flutterwave", people).map((p) => p.id)).toEqual(["2"]);
    expect(matchCompany("ab", people)).toEqual([]);
  });
});

describe("matchEvents", () => {
  const rooms = [{ title: "Moonshot by TechCabal" }, { title: "Lagos Fintech Breakfast" }, { title: "Moonshot side dinner" }, { title: "Moonshot afterparty" }];
  it("matches titles from 4 characters, up to two", () => {
    expect(matchEvents("moonshot", rooms).map((r) => r.title)).toEqual(["Moonshot by TechCabal", "Moonshot side dinner"]);
    expect(matchEvents("Lagos Fintech Breakfast 2026", rooms).map((r) => r.title)).toEqual(["Lagos Fintech Breakfast"]);
    expect(matchEvents("moo", rooms)).toEqual([]);
  });
});

describe("localPaths", () => {
  it("finds warm paths by name, company, where we met and notes", () => {
    const network = [
      { id: "a", name: "Kemi Adebayo", company: null, whereMet: null, notes: null },
      { id: "b", name: "Tunde", company: "Kestrel", whereMet: null, notes: null },
      { id: "c", name: "Sade", company: null, whereMet: "Moonshot 2025", notes: null },
      { id: "d", name: "Bisi", company: null, whereMet: null, notes: "Knows the Moonshot organisers well" },
      { id: "e", name: "Femi", company: null, whereMet: null, notes: "Nothing relevant" },
    ];
    expect(localPaths(["Kemi Adebayo", "Kestrel Ventures", "Moonshot"], network)).toEqual([
      { contactId: "a", how: "Already in your network", angle: "" },
      { contactId: "b", how: "Works at Kestrel", angle: "" },
      { contactId: "c", how: "You met them at Moonshot 2025", angle: "" },
      { contactId: "d", how: "Mentioned in your notes on them", angle: "" },
    ]);
  });
});
