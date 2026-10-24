import "server-only";
import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { addDays, type IsoDate } from "@/domain/dates";
import { suggestTriage, type TriageAction } from "@/domain/triage";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";

type Signals = { starred?: boolean; labels?: string[]; hasName?: boolean };

/** Fills in the suggested sort for people waiting in triage, using meetings logged so far. */
export async function computeTriageSuggestions(tx: Tx, opts: { today: IsoDate; importId?: string }) {
  const pending = await tx
    .select({ id: t.personSpaces.id, personId: t.personSpaces.personId, signals: t.personSpaces.triageSuggestion, company: t.people.company, position: t.people.position, source: t.people.source })
    .from(t.personSpaces)
    .innerJoin(t.people, eq(t.people.id, t.personSpaces.personId))
    .where(and(eq(t.personSpaces.triageState, "pending"), isNull(t.people.deletedAt), opts.importId ? eq(t.people.importId, opts.importId) : undefined));
  if (!pending.length) return 0;
  const since = addDays(opts.today, -183);
  const counts = new Map<string, number>();
  for (let i = 0; i < pending.length; i += 1000) {
    const ids = pending.slice(i, i + 1000).map((p) => p.personId);
    const rows = await tx
      .select({ personId: t.interactions.personId, n: sql<number>`count(*)::int` })
      .from(t.interactions)
      .where(and(inArray(t.interactions.personId, ids), gte(t.interactions.occurredOn, since)))
      .groupBy(t.interactions.personId);
    for (const r of rows) counts.set(r.personId, r.n);
  }
  for (let i = 0; i < pending.length; i += 500) {
    const values = pending.slice(i, i + 500).map((p) => {
      const sig = (p.signals ?? {}) as Signals;
      const s = suggestTriage({
        starred: Boolean(sig.starred),
        labels: sig.labels ?? [],
        hasName: sig.hasName ?? true,
        meetings: counts.get(p.personId) ?? 0,
        company: p.company,
        position: p.position,
        provider: p.source,
      });
      return sql`(${p.id}::uuid, ${JSON.stringify({ ...sig, ...s })}::jsonb)`;
    });
    await tx.execute(sql`update person_spaces ps set triage_suggestion = v.s from (values ${sql.join(values, sql`, `)}) as v(id, s) where ps.id = v.id`);
  }
  return pending.length;
}

export type TriageItem = {
  membershipId: string;
  personId: string;
  name: string;
  company: string | null;
  position: string | null;
  emails: string[];
  phones: string[];
  spaceName: string;
  suggestion: { action: TriageAction; reason: string } | null;
};

export async function listTriage(tx: Tx, spaceId: string | null, limit = 50): Promise<{ items: TriageItem[]; total: number; byAction: Record<TriageAction, number> }> {
  const where = and(eq(t.personSpaces.triageState, "pending"), isNull(t.people.deletedAt), spaceId ? eq(t.personSpaces.spaceId, spaceId) : undefined);
  const rows = await tx
    .select({ m: t.personSpaces, p: t.people, spaceName: t.spaces.name })
    .from(t.personSpaces)
    .innerJoin(t.people, eq(t.people.id, t.personSpaces.personId))
    .innerJoin(t.spaces, eq(t.spaces.id, t.personSpaces.spaceId))
    .where(where)
    .orderBy(sql`case ${t.personSpaces.triageSuggestion} ->> 'action' when 'priority' then 0 when 'keep' then 1 else 2 end`, asc(t.people.name))
    .limit(limit);
  const counts = await tx
    .select({ action: sql<string>`coalesce(${t.personSpaces.triageSuggestion} ->> 'action', 'keep')`, n: sql<number>`count(*)::int` })
    .from(t.personSpaces)
    .innerJoin(t.people, eq(t.people.id, t.personSpaces.personId))
    .where(where)
    .groupBy(sql`1`);
  const byAction = { priority: 0, keep: 0, not_now: 0 } as Record<TriageAction, number>;
  for (const c of counts) byAction[c.action as TriageAction] = c.n;
  return {
    total: counts.reduce((n, c) => n + c.n, 0),
    byAction,
    items: rows.map(({ m, p, spaceName }) => {
      const s = m.triageSuggestion as { action?: TriageAction; reason?: string } | null;
      return {
        membershipId: m.id,
        personId: p.id,
        name: p.name,
        company: p.company,
        position: p.position,
        emails: p.emails,
        phones: p.phones,
        spaceName,
        suggestion: s?.action ? { action: s.action, reason: s.reason ?? "" } : null,
      };
    }),
  };
}

/** Sorts people out of triage. Not now archives them (kept, searchable, no reminders). */
export async function applyTriage(tx: Tx, decisions: { membershipId: string; action: TriageAction; cadenceDays?: number | null }[]) {
  for (const d of decisions) {
    await tx
      .update(t.personSpaces)
      .set({
        triageState: "done",
        ...(d.action === "priority" ? { starred: true } : {}),
        ...(d.action === "not_now" ? { archivedAt: new Date() } : {}),
        ...(d.cadenceDays !== undefined ? { cadenceDays: d.cadenceDays } : {}),
      })
      .where(and(eq(t.personSpaces.id, d.membershipId), eq(t.personSpaces.triageState, "pending")));
  }
}

/** "Use suggested sort for everyone": one statement, so it's quick for thousands. */
export async function acceptSuggestedSort(tx: Tx, spaceId: string | null) {
  const rows = await tx.execute<{ action: string; n: number }>(sql`
    with done as (
      update person_spaces ps
         set triage_state = 'done',
             starred = ps.starred or coalesce(ps.triage_suggestion ->> 'action', 'keep') = 'priority',
             archived_at = case when ps.triage_suggestion ->> 'action' = 'not_now' then now() else ps.archived_at end
       where ps.triage_state = 'pending' ${spaceId ? sql`and ps.space_id = ${spaceId}` : sql``}
         and exists (select 1 from people p where p.id = ps.person_id and p.deleted_at is null)
      returning coalesce(ps.triage_suggestion ->> 'action', 'keep') as action
    )
    select action, count(*)::int as n from done group by action`);
  return Object.fromEntries([...rows].map((r) => [r.action, r.n])) as Partial<Record<TriageAction, number>>;
}

/** Undo an import: removes the people, touches and rooms it created. Filled-in details on people you already had stay. */
export async function undoImport(tx: Tx, importId: string) {
  await tx.delete(t.interactions).where(eq(t.interactions.importId, importId));
  await tx.delete(t.events).where(eq(t.events.importId, importId));
  await tx.delete(t.people).where(eq(t.people.importId, importId));
  await tx.delete(t.suggestions).where(and(eq(t.suggestions.origin, "import"), eq(t.suggestions.originId, importId)));
  await tx.update(t.imports).set({ status: "cancelled" }).where(eq(t.imports.id, importId));
}
