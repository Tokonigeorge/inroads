import { describe, expect, it } from "vitest";
import { parseCsvRows } from "@/importers/contact-csv";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes only when needed and doubles quotes", () => {
    expect(csvCell("Adaeze")).toBe("Adaeze");
    expect(csvCell('Said "hi", then left')).toBe('"Said ""hi"", then left"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(["a@x.com", "b@x.com"])).toBe("a@x.com; b@x.com");
  });

  it("defuses formulas but keeps phone numbers", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("-")).toBe("-");
    expect(csvCell("+2348031234567")).toBe("+2348031234567");
    expect(csvCell("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
  });

  it("round-trips through the importer's parser", () => {
    const rows = [["Ngozi Eze", 'Met at "Founders, Lagos"', "line 1\nline 2"]];
    expect(parseCsvRows(toCsv(["Name", "Where", "Notes"], rows))).toEqual([["Name", "Where", "Notes"], ...rows]);
  });
});
