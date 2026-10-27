import { norm } from "../prompts/shared";

/**
 * What a look-up recognises from what you've saved, ported from the prototype's knownFor()
 * (L1536–1557) and localPaths() (L1651). Pure: the loaders hand in this Space's rows.
 */

export type PersonCandidate = { id: string; name: string; company: string | null; socials: Record<string, string> | null };

/** People whose name matches the query (exact, or containment for 5+ characters), or whose saved handle does. Up to 3. */
export function matchPeople<T extends PersonCandidate>(q: string, people: T[]): T[] {
  const nq = norm(q);
  if (nq.length < 3) return [];
  const handle = nq.replace(/^@/, "");
  return people
    .filter((c) => {
      const n = norm(c.name);
      if (n && (n === nq || (nq.length >= 5 && (n.includes(nq) || nq.includes(n))))) return true;
      return Object.values(c.socials ?? {}).some((v) => {
        const h = norm(v).replace(/^@/, "");
        return Boolean(h) && (h === handle || (h.length >= 4 && nq.includes(h)));
      });
    })
    .slice(0, 3);
}

/** People whose company matches a company or place query. Up to 4. */
export function matchCompany<T extends PersonCandidate>(q: string, people: T[]): T[] {
  const nq = norm(q);
  if (nq.length < 3) return [];
  return people
    .filter((c) => {
      const co = norm(c.company);
      return Boolean(co) && (co === nq || co.includes(nq) || nq.includes(co));
    })
    .slice(0, 4);
}

/** Rooms on my list whose title matches an event query (4+ characters). Up to 2. */
export function matchEvents<T extends { title: string }>(q: string, rooms: T[]): T[] {
  const nq = norm(q);
  if (nq.length < 4) return [];
  return rooms
    .filter((e) => {
      const t = norm(e.title);
      return Boolean(t) && (t.includes(nq) || nq.includes(t));
    })
    .slice(0, 2);
}

export type NetworkRow = { id: string; name: string; company: string | null; whereMet: string | null; notes: string | null };
export type LocalPath = { contactId: string; how: string; angle: string };

/** Warm paths found locally: same name, works there, met there, or mentioned in your notes. Up to 8. */
export function localPaths(terms: string[], network: NetworkRow[]): LocalPath[] {
  const ts = [...new Set(terms.map(norm).filter((x) => x.length >= 4))];
  const out: LocalPath[] = [];
  for (const c of network) {
    const name = norm(c.name);
    const company = norm(c.company);
    const met = norm(c.whereMet);
    const notes = norm(c.notes);
    for (const t of ts) {
      if (name === t) {
        out.push({ contactId: c.id, how: "Already in your network", angle: "" });
        break;
      }
      if (company.length >= 3 && (t.includes(company) || company.includes(t))) {
        out.push({ contactId: c.id, how: `Works at ${c.company}`, angle: "" });
        break;
      }
      if (met && met.includes(t)) {
        out.push({ contactId: c.id, how: `You met them at ${c.whereMet}`, angle: "" });
        break;
      }
      if (notes && notes.includes(t)) {
        out.push({ contactId: c.id, how: "Mentioned in your notes on them", angle: "" });
        break;
      }
    }
  }
  return out.slice(0, 8);
}
