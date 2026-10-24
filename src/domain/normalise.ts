import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

/** Lowercased, trimmed email without a mailto: prefix, or null if it isn't one. */
export function normaliseEmail(raw: string | null | undefined): string | null {
  const v = String(raw ?? "")
    .trim()
    .replace(/^mailto:/i, "")
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : null;
}

/**
 * E.164 (e.g. +2348031234567) using the profile's region for local numbers like 0803 123 4567.
 * Returns null for anything that isn't a valid number; callers keep the raw text elsewhere.
 */
export function normalisePhone(raw: string | null | undefined, defaultRegion = "NG"): string | null {
  const v = String(raw ?? "").trim();
  if (!v || v.replace(/\D/g, "").length < 5) return null;
  const candidate = v.startsWith("00") ? `+${v.slice(2)}` : v;
  const parsed = parsePhoneNumberFromString(candidate, defaultRegion.toUpperCase() as CountryCode);
  if (parsed?.isValid()) return parsed.number;
  // "2348031234567" typed without the plus.
  const withPlus = parsePhoneNumberFromString(`+${v.replace(/\D/g, "")}`);
  return withPlus?.isValid() ? withPlus.number : null;
}

/** "+234 803 123 4567" for display; falls back to the stored value. */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

/** wa.me wants digits only, no plus. */
export function whatsappDigits(e164: string): string {
  return e164.replace(/\D/g, "");
}

/** Accent- and case-insensitive key for comparing names. Only ever used for suggestions. */
export function nameKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9@.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Deduplicated, normalised lists, keeping the user's order. Invalid entries are reported back. */
export function normaliseContactLists(input: { emails: string[]; phones: string[] }, region: string) {
  const emails: string[] = [];
  const phones: string[] = [];
  const invalid: { field: "emails" | "phones"; value: string }[] = [];
  for (const e of input.emails.map((x) => x.trim()).filter(Boolean)) {
    const n = normaliseEmail(e);
    if (!n) invalid.push({ field: "emails", value: e });
    else if (!emails.includes(n)) emails.push(n);
  }
  for (const p of input.phones.map((x) => x.trim()).filter(Boolean)) {
    const n = normalisePhone(p, region);
    if (!n) invalid.push({ field: "phones", value: p });
    else if (!phones.includes(n)) phones.push(n);
  }
  return { emails, phones, invalid };
}
