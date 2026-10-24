import type { IncomingContact } from "@/domain/dedupe";
import { normaliseEmail, normalisePhone } from "@/domain/normalise";

export type PickedContact = { name: string[]; email: string[]; tel: string[] };

/**
 * Contacts chosen with the browser's Contact Picker (Android Chrome). They carry no stable id,
 * so dedupe falls back to email, then phone, then a name-only suggestion.
 */
export function mapPickedContacts(picked: PickedContact[], region: string): IncomingContact[] {
  const out: IncomingContact[] = [];
  for (const p of picked) {
    const emails = [...new Set(p.email.map((e) => normaliseEmail(e)).filter((x): x is string => Boolean(x)))];
    const phones = [...new Set(p.tel.map((n) => normalisePhone(n, region)).filter((x): x is string => Boolean(x)))];
    const given = p.name.map((n) => n.trim()).find(Boolean) ?? "";
    const name = given || emails[0] || phones[0] || "";
    if (!name) continue;
    out.push({
      externalId: null,
      name,
      hasName: Boolean(given),
      emails,
      phones,
      company: null,
      position: null,
      city: null,
      birthday: null,
      socials: {},
      labels: [],
      starred: false,
    });
  }
  return out;
}
