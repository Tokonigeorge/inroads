import "server-only";
import { randomUUID } from "node:crypto";
import { eq, isNull, sql } from "drizzle-orm";
import { tagsSchema } from "@/contracts/people";
import type { IsoDate } from "@/domain/dates";
import { planImport, type ExistingPerson, type IncomingContact } from "@/domain/dedupe";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";

export type ImportContext = { userId: string; importId: string; spaceId: string; today: IsoDate; source: string };
export type ContactsSummary = { found: number; added: number; updated: number; unchanged: number; possibleDuplicates: number };

const CHUNK = 250;
const chunks = <T,>(xs: T[], n = CHUNK) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Is this "name" really a phone number or email address? */
export const looksNameless = (name: string) => name.includes("@") || /^[+()\d\s.-]{5,}$/.test(name.trim());

export async function loadExisting(tx: Tx): Promise<ExistingPerson[]> {
  const rows = await tx
    .select({
      id: t.people.id,
      name: t.people.name,
      emails: t.people.emails,
      phones: t.people.phones,
      company: t.people.company,
      position: t.people.position,
      city: t.people.city,
      birthday: t.people.birthday,
      socials: t.people.socials,
      refs: t.people.externalRefs,
    })
    .from(t.people)
    .where(isNull(t.people.deletedAt));
  return rows.map((r) => ({
    ...r,
    hasName: !looksNameless(r.name),
    socials: (r.socials ?? {}) as Record<string, string>,
    externalIds: Object.entries((r.refs ?? {}) as Record<string, string>).map(([p, id]) => `${p}:${id}`),
  }));
}

const splitExternal = (x: string | null): Record<string, string> => {
  if (!x) return {};
  const i = x.indexOf(":");
  return i > 0 ? { [x.slice(0, i)]: x.slice(i + 1) } : {};
};

/**
 * Adds new people (waiting to be sorted in triage), fills blanks on people you already have,
 * and raises "possible duplicate" suggestions for same-name matches. Nothing existing is
 * overwritten and no two people are merged without you.
 */
export async function applyContacts(tx: Tx, ctx: ImportContext, incoming: IncomingContact[]): Promise<ContactsSummary> {
  const existing = await loadExisting(tx);
  const plan = planImport(existing, incoming);
  const ids = new Map<string, string>();

  for (const batch of chunks(plan.adds)) {
    const rows = batch.map(({ key, contact: c }) => {
      const id = randomUUID();
      ids.set(key, id);
      return {
        id,
        userId: ctx.userId,
        name: c.name.slice(0, 120),
        emails: c.emails,
        phones: c.phones,
        company: c.company,
        position: c.position,
        city: c.city,
        birthday: c.birthday,
        socials: c.socials,
        source: ctx.source,
        externalRefs: splitExternal(c.externalId),
        importId: ctx.importId,
      };
    });
    await tx.insert(t.people).values(rows);
    await tx.insert(t.personSpaces).values(
      batch.map(({ key, contact: c }) => ({
        userId: ctx.userId,
        personId: ids.get(key)!,
        spaceId: ctx.spaceId,
        tags: tagsSchema.parse(c.labels).slice(0, 20),
        notes: c.notes ?? null,
        whereMet: c.whereMet ?? null,
        metOn: c.metOn ?? null,
        triageState: "pending",
        // Signals for the suggested sort, finished by suggestTriage() once meetings are known.
        triageSuggestion: { starred: c.starred, labels: c.labels, hasName: c.hasName },
        cadenceAnchorOn: ctx.today,
      })),
    );
  }

  for (const m of plan.merges) {
    const { hasName: _drop, ...patch } = m.patch;
    void _drop;
    await tx
      .update(t.people)
      .set({
        ...patch,
        ...(m.externalId ? { externalRefs: sql`${t.people.externalRefs} || ${JSON.stringify(splitExternal(m.externalId))}::jsonb` } : {}),
      })
      .where(eq(t.people.id, m.personId));
  }

  const resolve = (x: { personId: string } | { key: string }) => ("personId" in x ? x.personId : ids.get(x.key)!);
  for (const batch of chunks(plan.possibleDuplicates)) {
    await tx.insert(t.suggestions).values(
      batch.map((d) => ({
        userId: ctx.userId,
        spaceId: ctx.spaceId,
        kind: "merge",
        targetType: "person",
        targetId: resolve(d.b),
        payload: { personIds: [resolve(d.a), resolve(d.b)] },
        why: d.reason,
        origin: "import",
        originId: ctx.importId,
      })),
    );
  }

  return {
    found: incoming.length,
    added: plan.adds.length,
    updated: plan.merges.filter((m) => Object.keys(m.patch).length).length,
    unchanged: plan.unchanged.length + plan.merges.filter((m) => !Object.keys(m.patch).length).length,
    possibleDuplicates: plan.possibleDuplicates.length,
  };
}
