import { readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { normBday, labelsToTags, toIncoming, urlsToSocials } from "./common";
import { parseContactCsv, parseCsvRows } from "./contact-csv";
import { decodeText, readImportFiles } from "./files";
import { parseVcf } from "./vcf";

const fixture = (name: string) => readFileSync(new URL(`../../tests/fixtures/files/${name}`, import.meta.url));

describe("helpers", () => {
  it("normalises birthdays from every export format, dropping years", () => {
    expect(normBday("1990-03-14")).toBe("03-14");
    expect(normBday("19900314")).toBe("03-14");
    expect(normBday("--05-14")).toBe("05-14");
    expect(normBday("--0601")).toBe("06-01");
    expect(normBday("14-05-1990")).toBe("05-14");
    expect(normBday("5/14/1990")).toBe("05-14");
    expect(normBday("13/40/1990")).toBeNull();
    expect(normBday("")).toBeNull();
  });
  it("turns labels into tags and a starred flag", () => {
    expect(labelsToTags(["* myContacts", "Investors", "starred", "Imported on 1/2", "Lagos Tech"])).toEqual({ labels: ["investors", "lagos-tech"], starred: true });
  });
  it("sorts links into profiles", () => {
    expect(urlsToSocials(["https://www.linkedin.com/in/kemi", "https://x.com/k", "kemi.dev", "not a url"])).toEqual({ linkedin: "https://www.linkedin.com/in/kemi", x: "https://x.com/k", website: "kemi.dev" });
  });
  it("gives the same contact the same id every time, so re-importing adds nothing", () => {
    const a = toIncoming({ name: "Kemi", emails: ["K@x.com"], phones: [] }, "NG", "file")!;
    const b = toIncoming({ name: "kemi", emails: ["k@x.com"], phones: [] }, "NG", "file")!;
    expect(a.externalId).toBe(b.externalId);
    expect(toIncoming({ name: "", emails: [], phones: ["abc"] }, "NG", "file")).toBeNull();
  });
  it("decodes UTF-8, and falls back to Windows-1252", () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x4f, 0x6b]))).toBe("Ok");
    expect(decodeText(new Uint8Array([0x4e, 0x77, 0x6f, 0x73, 0xfa]))).toBe("Nwosú");
  });
});

describe("parseVcf", () => {
  const cards = parseVcf(fixture("iphone.vcf").toString("utf8"));
  it("reads iPhone, Android 2.1 quoted-printable and folded lines", () => {
    expect(cards).toHaveLength(4);
    expect(cards[0]).toMatchObject({
      name: "Kemi Adebayo",
      emails: ["Kemi@Paystack.example"],
      phones: ["0803 123 4567"],
      company: "Paystack",
      position: "Head of Partnerships",
      city: "Lagos",
      birthday: "03-14",
      urls: ["https://www.linkedin.com/in/kemi"],
      labels: ["Investors", "starred"],
      notes: "Met at Lagos Startup Week, keen on fintech",
    });
    expect(cards[1].name).toBe("Ifeoma Nwosú");
    expect(cards[2]).toMatchObject({ name: "", phones: ["08098765432"] });
    expect(cards[3]).toMatchObject({ name: "Folded Name", birthday: "06-01" });
  });
});

describe("parseContactCsv", () => {
  it("handles quoted fields with commas and newlines", () => {
    expect(parseCsvRows('a,"b, c","d\n""e"""\r\nf,g,h')).toEqual([
      ["a", "b, c", 'd\n"e"'],
      ["f", "g", "h"],
    ]);
  });
  it("reads LinkedIn connections, skipping the notes above the header", () => {
    const rows = parseContactCsv(fixture("Connections.csv").toString("utf8"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Adaeze Okafor", company: "Kestrel Ventures", position: "Partner", whereMet: "LinkedIn", metOn: "2024-03-14", urls: ["https://www.linkedin.com/in/adaeze"] });
    expect(rows[1]).toMatchObject({ name: "Kwame Mensah", company: "Mensah & Co, Accra", emails: ["kwame@example.com"] });
  });
  it("reads Google CSV with multi-value cells", () => {
    const [tunde, nameless] = parseContactCsv(fixture("google.csv").toString("utf8"));
    expect(tunde).toMatchObject({
      name: "Tunde Bakare",
      emails: ["tunde@meridian.example", "t.bakare@gmail.com"],
      phones: ["+234 803 999 0000", "01 234 5678"],
      company: "Meridian Telecoms",
      birthday: "05-14",
      city: "Lagos",
      notes: "Line one\nline two",
    });
    expect(nameless).toMatchObject({ name: "", phones: ["0805 111 2222"] });
  });
});

describe("readImportFiles", () => {
  it("reads several files and zips, normalised, without duplicates", () => {
    const zip = zipSync({
      "Takeout/Contacts/All Contacts.vcf": new Uint8Array(fixture("iphone.vcf")),
      "Takeout/Calendar/me.ics": strToU8("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Breakfast\r\nDTSTART:20261101T080000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"),
      "Takeout/archive_browser.html": strToU8("<html></html>"),
    });
    const r = readImportFiles(
      [
        { name: "takeout.zip", bytes: zip },
        { name: "iphone.vcf", bytes: new Uint8Array(fixture("iphone.vcf")) },
        { name: "Connections.csv", bytes: new Uint8Array(fixture("Connections.csv")) },
        { name: "photo.jpg", bytes: new Uint8Array([1, 2, 3]) },
      ],
      "NG",
    );
    expect(r.contacts.map((c) => c.name)).toEqual(["Kemi Adebayo", "Ifeoma Nwosú", "+2348098765432", "Folded Name", "Adaeze Okafor", "Kwame Mensah"]);
    const kemi = r.contacts[0];
    expect(kemi).toMatchObject({ emails: ["kemi@paystack.example"], phones: ["+2348031234567"], starred: true, labels: ["investors"], socials: { linkedin: "https://www.linkedin.com/in/kemi" } });
    expect(r.contacts[2].hasName).toBe(false);
    expect(r.contacts[4]).toMatchObject({ whereMet: "LinkedIn", metOn: "2024-03-14" });
    expect(r.events).toHaveLength(1);
    expect(r.files).toEqual([
      { name: "All Contacts.vcf", contacts: 4, events: 0 },
      { name: "me.ics", contacts: 0, events: 1 },
      { name: "Connections.csv", contacts: 2, events: 0 },
    ]);
    expect(r.errors).toEqual(["photo.jpg isn't a contacts (.vcf, .csv) or calendar (.ics, .zip) file, so it was skipped."]);
  });

  it("refuses a broken zip with a plain message", () => {
    expect(readImportFiles([{ name: "x.zip", bytes: new Uint8Array([1, 2, 3, 4]) }], "NG").errors[0]).toMatch(/^Couldn't open x.zip/);
  });
});
