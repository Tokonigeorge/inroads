/**
 * Turns uploaded files into contacts and calendar events. Accepts .vcf, .csv and .ics files and
 * .zip archives of them (Google Takeout, LinkedIn's data export). Guards against huge or
 * malicious archives.
 */
import { unzipSync } from "fflate";
import type { IncomingContact } from "@/domain/dedupe";
import { toIncoming, type RawContact } from "./common";
import { parseContactCsv } from "./contact-csv";
import { parseIcs, type IcsEvent } from "./ics";
import { parseVcf } from "./vcf";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel's request body limit is 4.5 MB.
const MAX_UNZIPPED_BYTES = 40 * 1024 * 1024;
const MAX_CONTACTS = 20_000;

export type ParsedFiles = { contacts: IncomingContact[]; events: IcsEvent[]; files: { name: string; contacts: number; events: number }[]; errors: string[] };

/** UTF-8 when it is valid UTF-8, otherwise Windows-1252 (older Outlook and phone exports). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const kindOf = (name: string) => {
  const n = name.toLowerCase();
  if (/\.(vcf|vcard)$/.test(n)) return "vcf";
  if (n.endsWith(".csv")) return "csv";
  if (n.endsWith(".ics")) return "ics";
  if (n.endsWith(".zip")) return "zip";
  return null;
};

export function readImportFiles(files: { name: string; bytes: Uint8Array }[], region: string): ParsedFiles {
  const out: ParsedFiles = { contacts: [], events: [], files: [], errors: [] };
  const seen = new Set<string>();

  const take = (name: string, bytes: Uint8Array, inZip: boolean) => {
    const kind = kindOf(name);
    const base = name.split("/").pop() ?? name;
    if (!kind) {
      if (!inZip) out.errors.push(`${base} isn't a contacts (.vcf, .csv) or calendar (.ics, .zip) file, so it was skipped.`);
      return;
    }
    if (kind === "zip") {
      if (inZip) return;
      let total = 0;
      let entries: Record<string, Uint8Array>;
      try {
        entries = unzipSync(bytes, {
          filter: (f) => {
            if (!kindOf(f.name) || kindOf(f.name) === "zip") return false;
            total += f.originalSize;
            return total <= MAX_UNZIPPED_BYTES;
          },
        });
      } catch {
        out.errors.push(`Couldn't open ${base}. Unzip it on your device and choose the .vcf, .csv or .ics files inside.`);
        return;
      }
      if (total > MAX_UNZIPPED_BYTES) out.errors.push(`${base} is too large once unzipped; only part of it was read.`);
      const names = Object.keys(entries);
      if (!names.length) out.errors.push(`${base} has no contacts or calendar files in it.`);
      for (const n of names) take(n, entries[n], true);
      return;
    }
    const text = decodeText(bytes);
    let raw: RawContact[] = [];
    let events: IcsEvent[] = [];
    if (kind === "vcf") raw = parseVcf(text);
    else if (kind === "csv") {
      raw = parseContactCsv(text);
      // LinkedIn's export has other CSVs (messages, invitations); only connections are contacts.
      if (!raw.length && !inZip) out.errors.push(`${base} doesn't look like a contacts file. It needs a header row with names or email addresses.`);
    } else events = parseIcs(text).events;
    const source = kind === "csv" && /connections\.csv$/i.test(base) ? "linkedin" : kind === "ics" ? "ics" : kind;
    let n = 0;
    for (const r of raw) {
      if (out.contacts.length >= MAX_CONTACTS) break;
      const c = toIncoming(r, region, source === "linkedin" ? "linkedin" : "file");
      if (!c || seen.has(c.externalId!)) continue;
      seen.add(c.externalId!);
      out.contacts.push(c);
      n++;
    }
    out.events.push(...events);
    if (n || events.length) out.files.push({ name: base, contacts: n, events: events.length });
  };

  for (const f of files) take(f.name, f.bytes, false);
  if (out.contacts.length >= MAX_CONTACTS) out.errors.push(`Only the first ${MAX_CONTACTS.toLocaleString("en-GB")} contacts were read.`);
  return out;
}
