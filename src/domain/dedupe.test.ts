import { describe, expect, it } from "vitest";
import { fillBlanks, planImport, type ExistingPerson, type IncomingContact } from "./dedupe";

const base = { hasName: true, emails: [], phones: [], company: null, position: null, city: null, birthday: null, socials: {} };
const person = (id: string, o: Partial<ExistingPerson>): ExistingPerson => ({ ...base, id, name: id, externalIds: [], ...o });
const contact = (o: Partial<IncomingContact>): IncomingContact => ({ ...base, name: "?", externalId: null, labels: [], starred: false, ...o });

describe("planImport", () => {
  const existing = [
    person("ada", { name: "Ada Okafor", emails: ["ada@kestrel.example"], externalIds: ["google:people/c1"] }),
    person("tunde", { name: "Tunde Bakare", phones: ["+2348031234567"], company: "Meridian" }),
    person("david", { name: "David Okafor", phones: ["+2348000000001"] }),
  ];

  it("matches by external id, then email, then phone, filling only blanks", () => {
    const plan = planImport(existing, [
      contact({ name: "Ada O.", externalId: "google:people/c1", position: "Partner" }),
      contact({ name: "Tunde B", emails: ["TUNDE@meridian.example"], phones: ["+2348031234567"], company: "Other Co", city: "Lagos" }),
    ]);
    expect(plan.adds).toEqual([]);
    expect(plan.merges).toEqual([
      { personId: "ada", patch: { position: "Partner" }, externalId: null },
      { personId: "tunde", patch: { city: "Lagos", emails: ["tunde@meridian.example"] }, externalId: null },
    ]);
  });

  it("never merges two different people who share a name", () => {
    const plan = planImport(existing, [contact({ name: "David Okafor", phones: ["+2348099999999"] })]);
    expect(plan.adds).toHaveLength(1);
    expect(plan.merges).toEqual([]);
    expect(plan.possibleDuplicates).toEqual([{ a: { personId: "david" }, b: { key: plan.adds[0].key }, reason: expect.stringContaining("no shared email or phone") }]);
  });

  it("collapses duplicates inside one import by email or phone, but not by name", () => {
    const plan = planImport([], [
      contact({ name: "Kemi", phones: ["+2348011111111"] }),
      contact({ name: "Kemi Adebayo", phones: ["+2348011111111"], emails: ["kemi@x.io"], starred: true, labels: ["friends"] }),
      contact({ name: "Seun", emails: ["s@x.io"] }),
      contact({ name: "Seun", emails: ["other@x.io"] }),
    ]);
    expect(plan.adds.map((a) => [a.contact.name, a.contact.emails, a.contact.starred, a.contact.labels])).toEqual([
      ["Kemi", ["kemi@x.io"], true, ["friends"]],
      ["Seun", ["s@x.io"], false, []],
      ["Seun", ["other@x.io"], false, []],
    ]);
    expect(plan.possibleDuplicates).toHaveLength(1);
  });

  it("records a new external id on a person matched by email, and counts unchanged matches", () => {
    const plan = planImport(existing, [
      contact({ name: "Ada", emails: ["ada@kestrel.example"], externalId: "microsoft:abc" }),
      contact({ name: "Tunde", phones: ["+2348031234567"] }),
    ]);
    expect(plan.merges).toEqual([{ personId: "ada", patch: {}, externalId: "microsoft:abc" }]);
    expect(plan.unchanged).toEqual([{ personId: "tunde", externalId: null }]);
  });

  it("doesn't suggest duplicates for nameless entries", () => {
    const plan = planImport([person("x", { name: "+2348000000002", hasName: false })], [contact({ name: "+2348000000002", hasName: false, phones: ["+2348000000003"] })]);
    expect(plan.possibleDuplicates).toEqual([]);
  });
});

describe("fillBlanks", () => {
  it("adds missing details, gives a nameless entry a real name, and never overwrites", () => {
    const patch = fillBlanks({ ...base, name: "+234…", hasName: false, company: "A", socials: { x: "@a" } }, { ...base, name: "Real Name", company: "B", socials: { x: "@b", linkedin: "in/a" } });
    expect(patch).toEqual({ name: "Real Name", hasName: true, socials: { x: "@a", linkedin: "in/a" } });
    expect(fillBlanks({ ...base, name: "A", company: "A" }, { ...base, name: "A", company: "B" })).toBeNull();
  });
});
