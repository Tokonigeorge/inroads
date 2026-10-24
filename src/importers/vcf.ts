/**
 * vCard (.vcf) contacts: Google Contacts export, Google Takeout, iPhone, Android (vCard 2.1 with
 * quoted-printable) and Outlook. Ported from the prototype's parseVCF().
 */
import { normBday, type RawContact } from "./common";

function splitUnescaped(v: string, sep: string) {
  const out: string[] = [];
  let cur = "";
  for (let k = 0; k < v.length; k++) {
    const ch = v[k];
    if (ch === "\\" && k + 1 < v.length) {
      cur += ch + v[++k];
      continue;
    }
    if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
const unescape = (v: string) =>
  v
    .replace(/\\n/gi, "\n")
    .replace(/\\([,;\\:])/g, "$1")
    .trim();

function decodeQuotedPrintable(s: string) {
  const bytes: number[] = [];
  const enc = new TextEncoder();
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(...enc.encode(s[i]));
  }
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
  } catch {
    return s;
  }
}

type Card = { fn?: string; n?: string[]; nick?: string; emails: string[]; phones: string[]; org?: string; title?: string; city?: string; bday?: string; note?: string; urls: string[]; cats: string[] };

export function parseVcf(text: string): RawContact[] {
  const lines: string[] = [];
  for (const l of text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n")) {
    const prev = lines.at(-1);
    if (/^[ \t]/.test(l) && lines.length) lines[lines.length - 1] += l.slice(1);
    else if (prev !== undefined && /=$/.test(prev) && /QUOTED-PRINTABLE/i.test(prev.split(":")[0])) lines[lines.length - 1] = prev.slice(0, -1) + l;
    else lines.push(l);
  }
  const cards: Card[] = [];
  let cur: Card | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^BEGIN:VCARD/i.test(line)) {
      cur = { emails: [], phones: [], urls: [], cats: [] };
      continue;
    }
    if (/^END:VCARD/i.test(line)) {
      if (cur) cards.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const head = line.slice(0, i).replace(/^item\d+\./i, "");
    const key = head.split(";")[0].toUpperCase();
    let val = line.slice(i + 1);
    if (/QUOTED-PRINTABLE/i.test(head)) val = decodeQuotedPrintable(val);
    switch (key) {
      case "FN":
        cur.fn = unescape(val);
        break;
      case "N":
        cur.n = splitUnescaped(val, ";").map(unescape);
        break;
      case "NICKNAME":
        cur.nick = unescape(val);
        break;
      case "EMAIL":
        cur.emails.push(unescape(val));
        break;
      case "TEL":
        cur.phones.push(unescape(val).replace(/^tel:/i, ""));
        break;
      case "ORG":
        cur.org = unescape(splitUnescaped(val, ";")[0] ?? "");
        break;
      case "TITLE":
        cur.title = unescape(val);
        break;
      case "ADR":
        cur.city ??= unescape(splitUnescaped(val, ";")[3] ?? "");
        break;
      case "BDAY":
        cur.bday = unescape(val);
        break;
      case "NOTE":
        cur.note = unescape(val);
        break;
      case "URL":
      case "X-SOCIALPROFILE":
        cur.urls.push(unescape(val));
        break;
      case "CATEGORIES":
        cur.cats.push(...splitUnescaped(val, ",").map(unescape));
        break;
    }
  }
  return cards.map((v) => {
    const n = v.n ?? [];
    const name = v.fn?.trim() || [n[1], n[2], n[0]].filter(Boolean).join(" ") || v.nick || "";
    return {
      name,
      emails: v.emails,
      phones: v.phones.filter((p) => p.replace(/\D/g, "").length >= 5),
      company: v.org ?? "",
      position: v.title ?? "",
      city: v.city ?? "",
      birthday: normBday(v.bday),
      urls: v.urls,
      labels: v.cats,
      notes: v.note ?? "",
    };
  });
}
