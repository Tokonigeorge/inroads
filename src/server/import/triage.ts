import "server-only";
import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { addDays, type IsoDate } from "@/domain/dates";
import { fitMatcher, fitWords, keeps, ruleOptions, type SortCandidate, type SortRule } from "@/domain/sort-rules";
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

/** Everyone waiting to be sorted, with what the sort rules look at. */
async function sortCandidates(tx: Tx, spaceId: string | null, today: IsoDate) {
  const since = addDays(today, -183);
  const rows = await tx.execute<{ id: string; signals: Signals | null; company: string | null; position: string | null; meetings: number }>(sql`
    select ps.id, ps.triage_suggestion as signals, p.company, p.position,
           (select count(*)::int from interactions i where i.person_id = p.id and i.occurred_on >= ${since}::date) as meetings
      from person_spaces ps join people p on p.id = ps.person_id and p.deleted_at is null
     where ps.triage_state = 'pending' ${spaceId ? sql`and ps.space_id = ${spaceId}` : sql``}`);
  return [...rows].map((r) => ({
    membershipId: r.id,
    c: { hasName: r.signals?.hasName ?? true, starred: Boolean(r.signals?.starred), labels: r.signals?.labels ?? [], meetings: r.meetings, company: r.company, position: r.position } satisfies SortCandidate,
  }));
}

/** The words "fits my goals and industries" looks for: from your profile and this Space's goals. */
async function sortFitWords(tx: Tx, spaceId: string | null) {
  const [profile] = await tx.select({ industries: t.profiles.industries }).from(t.profiles).limit(1);
  const goals = await tx
    .select({ text: t.goals.text, type: t.goals.type })
    .from(t.goals)
    .where(and(eq(t.goals.active, true), isNull(t.goals.archivedAt), eq(t.goals.example, false), spaceId ? eq(t.goals.spaceId, spaceId) : undefined));
  return fitWords({ industries: profile?.industries ?? [], goals });
}

/** The rules on offer for the people waiting, each with how many it keeps and sets aside. */
export async function previewSortRules(tx: Tx, spaceId: string | null, today: IsoDate) {
  const [cands, words] = await Promise.all([sortCandidates(tx, spaceId, today), sortFitWords(tx, spaceId)]);
  return { total: cands.length, options: ruleOptions(cands.map((x) => x.c), words), fitWords: words };
}

/**
 * Sorts everyone waiting by the rule you chose: kept people go on your list (starred if you
 * starred them in Google or Outlook), the rest are set aside: still searchable, no reminders.
 */
export async function applySortRule(tx: Tx, spaceId: string | null, rule: SortRule, today: IsoDate) {
  const [cands, words] = await Promise.all([sortCandidates(tx, spaceId, today), sortFitWords(tx, spaceId)]);
  const fits = fitMatcher(words);
  const keepIds: string[] = [];
  const asideIds: string[] = [];
  for (const x of cands) (keeps(rule, x.c, fits) ? keepIds : asideIds).push(x.membershipId);
  const sortIds = async (ids: string[], aside: boolean) => {
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = sql`array[${sql.join(ids.slice(i, i + 1000).map((id) => sql`${id}::uuid`), sql`, `)}]`;
      await tx.execute(sql`
        update person_spaces ps
           set triage_state = 'done',
               starred = ps.starred or coalesce((ps.triage_suggestion ->> 'starred')::boolean, false),
               archived_at = ${aside ? sql`now()` : sql`ps.archived_at`}
         where ps.id = any(${chunk}) and ps.triage_state = 'pending'`);
    }
  };
  await sortIds(keepIds, false);
  await sortIds(asideIds, true);
  return { kept: keepIds.length, setAside: asideIds.length };
}

/** Undo an import: removes the people, touches and rooms it created. Filled-in details on people you already had stay. */
export async function undoImport(tx: Tx, importId: string) {
  await tx.delete(t.interactions).where(eq(t.interactions.importId, importId));
  await tx.delete(t.events).where(eq(t.events.importId, importId));
  await tx.delete(t.people).where(eq(t.people.importId, importId));
  await tx.delete(t.suggestions).where(and(eq(t.suggestions.origin, "import"), eq(t.suggestions.originId, importId)));
  await tx.update(t.imports).set({ status: "cancelled" }).where(eq(t.imports.id, importId));
}
