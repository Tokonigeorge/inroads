/**
 * Decides what an import does with each incoming contact. Ported from the prototype's
 * planContacts()/fillBlanks(), fixing its two biggest bugs (brief §2):
 *  - Match order is external id → any email → any phone (E.164) → name.
 *  - A name-only match never merges. Both people are kept and a "possible duplicate"
 *    suggestion is raised for the user to review.
 */
import { nameKey } from "./normalise";

export type ContactFields = {
  name: string;
  /** False when the "name" is really an email or number (phone-book entries with no name). */
  hasName: boolean;
  emails: string[];
  phones: string[];
  company: string | null;
  position: string | null;
  city: string | null;
  birthday: string | null;
  socials: Record<string, string>;
};

export type IncomingContact = ContactFields & {
  /** "google:people/c123", "microsoft:AAMk…", "vcf:<hash>". */
  externalId: string | null;
  labels: string[];
  starred: boolean;
};

export type ExistingPerson = ContactFields & { id: string; externalIds: string[] };

export type Plan = {
  /** New people. `key` lets suggestions refer to people that don't exist yet. */
  adds: { key: string; contact: IncomingContact }[];
  /** Existing people that gain missing details (never overwritten). */
  merges: { personId: string; patch: Partial<ContactFields>; externalId: string | null }[];
  /** Matched an existing person and nothing new to add. */
  unchanged: { personId: string; externalId: string | null }[];
  /** Same name, no shared email or phone: maybe the same person. */
  possibleDuplicates: { a: { personId: string } | { key: string }; b: { key: string }; reason: string }[];
};

const lc = (s: string) => s.trim().toLowerCase();

/** What `incoming` would add to `existing` without overwriting anything. null if nothing. */
export function fillBlanks(existing: ContactFields, incoming: ContactFields): Partial<ContactFields> | null {
  const patch: Partial<ContactFields> = {};
  for (const k of ["company", "position", "city", "birthday"] as const) {
    if (!existing[k] && incoming[k]) patch[k] = incoming[k];
  }
  const emails = [...new Set([...existing.emails, ...incoming.emails.map(lc)])];
  if (emails.length !== existing.emails.length) patch.emails = emails;
  const phones = [...new Set([...existing.phones, ...incoming.phones])];
  if (phones.length !== existing.phones.length) patch.phones = phones;
  const socials = { ...existing.socials };
  let socialAdded = false;
  for (const [k, v] of Object.entries(incoming.socials)) {
    if (v && !socials[k]) {
      socials[k] = v;
      socialAdded = true;
    }
  }
  if (socialAdded) patch.socials = socials;
  if (!existing.hasName && incoming.hasName) {
    patch.name = incoming.name;
    patch.hasName = true;
  }
  return Object.keys(patch).length ? patch : null;
}

function mergeIncoming(a: IncomingContact, b: IncomingContact): IncomingContact {
  const patch = fillBlanks(a, b) ?? {};
  return { ...a, ...patch, labels: [...new Set([...a.labels, ...b.labels])], starred: a.starred || b.starred, externalId: a.externalId ?? b.externalId };
}

export function planImport(existing: ExistingPerson[], incoming: IncomingContact[]): Plan {
  const byExternal = new Map<string, ExistingPerson>();
  const byEmail = new Map<string, ExistingPerson>();
  const byPhone = new Map<string, ExistingPerson>();
  const byName = new Map<string, ExistingPerson[]>();
  for (const p of existing) {
    for (const x of p.externalIds) byExternal.set(x, p);
    for (const e of p.emails) byEmail.set(lc(e), p);
    for (const ph of p.phones) byPhone.set(ph, p);
    if (p.hasName) byName.set(nameKey(p.name), [...(byName.get(nameKey(p.name)) ?? []), p]);
  }

  // 1. Collapse duplicates inside the batch by external id, email or phone (never by name).
  const batch: IncomingContact[] = [];
  const seen = new Map<string, number>();
  for (const c of incoming) {
    const keys = [c.externalId && `x:${c.externalId}`, ...c.emails.map((e) => `e:${lc(e)}`), ...c.phones.map((p) => `p:${p}`)].filter(Boolean) as string[];
    const hit = keys.map((k) => seen.get(k)).find((i) => i !== undefined);
    if (hit !== undefined) {
      batch[hit] = mergeIncoming(batch[hit], c);
      for (const k of keys) seen.set(k, hit);
    } else {
      for (const k of keys) seen.set(k, batch.length);
      batch.push(c);
    }
  }

  // 2. Match against existing people.
  const plan: Plan = { adds: [], merges: [], unchanged: [], possibleDuplicates: [] };
  const touched = new Map<string, { patch: Partial<ContactFields>; externalId: string | null; base: ExistingPerson }>();
  const newByName = new Map<string, string[]>();
  batch.forEach((c, i) => {
    const match =
      (c.externalId ? byExternal.get(c.externalId) : undefined) ??
      c.emails.map((e) => byEmail.get(lc(e))).find(Boolean) ??
      c.phones.map((p) => byPhone.get(p)).find(Boolean);
    if (match) {
      const prior = touched.get(match.id);
      const base = prior ? { ...match, ...prior.patch } : match;
      const patch = fillBlanks(base as ContactFields, c);
      touched.set(match.id, { patch: { ...(prior?.patch ?? {}), ...(patch ?? {}) }, externalId: prior?.externalId ?? c.externalId, base: match });
      return;
    }
    const key = `n${i}`;
    plan.adds.push({ key, contact: c });
    if (c.hasName) {
      const nk = nameKey(c.name);
      for (const p of byName.get(nk) ?? []) plan.possibleDuplicates.push({ a: { personId: p.id }, b: { key }, reason: `Same name as ${p.name}, but no shared email or phone.` });
      for (const other of newByName.get(nk) ?? []) plan.possibleDuplicates.push({ a: { key: other }, b: { key }, reason: `Two contacts called ${c.name} with different details.` });
      newByName.set(nk, [...(newByName.get(nk) ?? []), key]);
    }
  });
  for (const [personId, t] of touched) {
    const hasPatch = Object.keys(t.patch).length > 0;
    const newExternal = t.externalId && !t.base.externalIds.includes(t.externalId) ? t.externalId : null;
    if (hasPatch || newExternal) plan.merges.push({ personId, patch: t.patch, externalId: newExternal });
    else plan.unchanged.push({ personId, externalId: null });
  }
  return plan;
}
