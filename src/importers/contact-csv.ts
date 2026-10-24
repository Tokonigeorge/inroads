/**
 * Contacts from CSV: Google CSV (current and older layouts), Outlook CSV, LinkedIn connections
 * export, and plain CSVs with a header row. Ported from the prototype's parseContactCSV().
 */
import { normBday, type RawContact } from "./common";

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(f);
      f = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(f);
      rows.push(row);
      row = [];
      f = "";
    } else f += ch;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const isHeader = (r: string[]) => r.some((c) => /^(first name|given name|name|full name|display name|e-?mail( address| 1 - value)?|email address)$/i.test(c.trim()));

/** Parses "Connected On" (LinkedIn: "14 Mar 2024") to an ISO date. */
function connectedOn(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v} 12:00 UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function parseContactCsv(text: string): RawContact[] {
  const rows = parseCsvRows(text.replace(/^﻿/, ""));
  // LinkedIn puts a few lines of notes above the header.
  const hi = rows.slice(0, 15).findIndex(isHeader);
  if (hi < 0) return [];
  const H = rows[hi].map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const col = (...tests: (string | RegExp)[]) => {
    for (const t of tests) {
      const i = H.findIndex((h) => (t instanceof RegExp ? t.test(h) : h === t));
      if (i >= 0) return i;
    }
    return -1;
  };
  const cols = (re: RegExp) => H.map((h, i) => (re.test(h) ? i : -1)).filter((i) => i >= 0);
  const uniq = (xs: number[]) => [...new Set(xs.filter((i) => i >= 0))];
  const C = {
    first: col("first name", "given name"),
    middle: col("middle name", "additional name"),
    last: col("last name", "family name", "surname"),
    full: col("name", "full name", "display name"),
    nick: col("nickname"),
    fileAs: col("file as"),
    company: col("organization name", "organisation name", "organization 1 - name", "company", "company name", "organization"),
    title: col("organization title", "organisation title", "organization 1 - title", "job title", "position", "title"),
    birthday: col("birthday"),
    notes: col("notes"),
    labels: col("labels", "group membership", "categories"),
    connected: col("connected on"),
    city: col("address 1 - city", "business city", "home city", "city"),
  };
  const emailCols = uniq([...cols(/^e-?mail \d+ - value$/), col("e-mail address", "email address", "e-mail", "email"), ...cols(/^e-?mail \d address$/)]);
  const phoneCols = uniq([col("mobile phone"), ...cols(/^phone \d+ - value$/), col("primary phone", "phone", "phone number", "mobile"), ...cols(/(phone|mobile)( \d)?$/).filter((i) => !/fax|pager|yomi|callback/.test(H[i]))]);
  const webCols = uniq([...cols(/^website \d+ - value$/), col("web page", "website", "url", "profile url", "linkedin")]);
  const get = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const multi = (v: string) =>
    v
      .split(/\s*:::\s*/)
      .map((x) => x.trim())
      .filter(Boolean);

  return rows.slice(hi + 1).map((r) => {
    const named = [get(r, C.first), get(r, C.middle), get(r, C.last)].filter(Boolean).join(" ") || get(r, C.full) || get(r, C.nick) || get(r, C.fileAs);
    const conn = get(r, C.connected);
    return {
      name: named,
      emails: emailCols.flatMap((i) => multi(get(r, i))),
      phones: phoneCols.flatMap((i) => multi(get(r, i))).filter((p) => p.replace(/\D/g, "").length >= 5),
      company: multi(get(r, C.company))[0] ?? "",
      position: multi(get(r, C.title))[0] ?? "",
      city: multi(get(r, C.city))[0] ?? "",
      birthday: normBday(get(r, C.birthday)),
      urls: webCols.flatMap((i) => multi(get(r, i))),
      labels: C.labels >= 0 ? get(r, C.labels).split(/\s*:::\s*|;/) : [],
      notes: get(r, C.notes),
      whereMet: conn ? "LinkedIn" : "",
      metOn: connectedOn(conn),
    };
  });
}
