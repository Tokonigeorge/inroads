/**
 * Shared pieces of the contact importers, ported from the prototype (urlsToSocials, normBday,
 * labelsToTags). Pure: safe in tests and on the server.
 */
import { createHash } from "node:crypto";
import type { IncomingContact } from "@/domain/dedupe";
import { normaliseEmail, normalisePhone } from "@/domain/normalise";

export function urlsToSocials(urls: string[]): Record<string, string> {
  const s: Record<string, string> = {};
  for (const raw of urls) {
    const v = raw.trim();
    if (!v || !(/^(https?:\/\/|www\.)/i.test(v) || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v))) continue;
    const key = /linkedin\.com/i.test(v)
      ? "linkedin"
      : /(twitter|x)\.com\//i.test(v)
        ? "x"
        : /instagram\.com/i.test(v)
          ? "instagram"
          : /tiktok\.com/i.test(v)
            ? "tiktok"
            : /github\.com/i.test(v)
              ? "github"
              : /substack\.com/i.test(v)
                ? "substack"
                : "website";
    s[key] ??= v;
  }
  return s;
}

const pad = (n: number) => String(n).padStart(2, "0");
const okMD = (mo: string, d: string) => {
  const m = Number(mo);
  const day = Number(d);
  return m >= 1 && m <= 12 && day >= 1 && day <= 31 ? `${pad(m)}-${pad(day)}` : null;
};

/** Birthdays as "MM-DD" from the formats contact exports use. Years are dropped on purpose. */
export function normBday(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})/))) return okMD(m[2], m[3]); // 1990-05-14, 19900514
  if ((m = v.match(/^--(\d{2})-?(\d{2})/))) return okMD(m[1], m[2]); // --05-14 (no year)
  if ((m = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4}|-)?$/))) return okMD(m[2], m[1]); // Google template: DD-MM-YYYY
  if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/\d{2,4}$/))) return okMD(m[1], m[2]); // Outlook: M/D/YYYY
  return null;
}

/** Contact groups/labels as tags; "starred" becomes a flag; system groups are dropped. */
export function labelsToTags(list: string[]): { labels: string[]; starred: boolean } {
  let starred = false;
  const out: string[] = [];
  for (const raw of list) {
    const l = raw.trim();
    if (!l) continue;
    if (/^\*?\s*starred$/i.test(l)) {
      starred = true;
      continue;
    }
    if (/^\*|^(my ?contacts|other contacts|all contacts)$|^imported on/i.test(l)) continue;
    out.push(l.toLowerCase().replace(/^#/, "").replace(/\s+/g, "-").slice(0, 30));
  }
  return { labels: [...new Set(out)].slice(0, 8), starred };
}

export type RawContact = {
  name: string;
  emails: string[];
  phones: string[];
  company?: string;
  position?: string;
  city?: string;
  birthday?: string | null;
  urls?: string[];
  labels?: string[];
  notes?: string;
  whereMet?: string;
  metOn?: string | null;
};

/**
 * Normalises a parsed row into what the import pipeline takes. File rows have no stable id,
 * so the id is a fingerprint of name, emails and phones: importing the same file twice
 * changes nothing, and a name-only match still never merges.
 */
export function toIncoming(r: RawContact, region: string, source: string): IncomingContact | null {
  const emails = [...new Set(r.emails.map((e) => normaliseEmail(e.replace(/^mailto:/i, ""))).filter((x): x is string => Boolean(x)))];
  const phones = [...new Set(r.phones.map((p) => normalisePhone(p, region)).filter((x): x is string => Boolean(x)))];
  const named = r.name.trim();
  const company = r.company?.trim() || null;
  const name = named || company || emails[0] || phones[0] || "";
  if (!name) return null;
  const { labels, starred } = labelsToTags(r.labels ?? []);
  const fingerprint = createHash("sha1")
    .update([name.toLowerCase(), ...emails.sort(), ...phones.sort()].join("|"))
    .digest("hex")
    .slice(0, 16);
  return {
    externalId: `${source}:${fingerprint}`,
    name: name.slice(0, 120),
    hasName: Boolean(named || company),
    emails,
    phones,
    company,
    position: r.position?.trim() || null,
    city: r.city?.trim() || null,
    birthday: r.birthday ?? null,
    socials: urlsToSocials(r.urls ?? []),
    labels,
    starred,
    notes: r.notes?.trim() ? r.notes.trim().slice(0, 2000) : null,
    whereMet: r.whereMet || null,
    metOn: r.metOn ?? null,
  };
}
