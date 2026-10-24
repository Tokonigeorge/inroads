import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import type { Result } from "./spaces";

const fail = (message: string): Result<never> => ({ ok: false, message });

export const mergeFields = ["name", "company", "position", "city", "birthday"] as const;
export type MergeField = (typeof mergeFields)[number];
export type MergeChoices = Partial<Record<MergeField, "keep" | "other">>;

type Json = Record<string, unknown>;
/** Everything needed to undo a merge: original rows, and which rows moved. */
type MergeRecord = {
  keepId: string;
  otherId: string;
  keep: Json;
  other: Json;
  /** person_spaces rows that moved from the other person to the kept one. */
  movedMemberships: string[];
  /** The kept person's memberships before details were combined into them. */
  combinedMemberships: Json[];
  /** Rows removed because the kept person already had the same one. */
  removed: { table: "person_spaces" | "goal_links" | "event_people" | "person_links"; row: Json }[];
  moved: { interactions: string[]; commitments: string[]; goalLinks: string[]; eventPeople: { eventId: string; role: string }[]; linksFrom: string[]; linksTo: string[]; dossiers: string[]; scores: string[] };
  at: string;
};

const rows = async (tx: Tx, q: ReturnType<typeof sql>) => [...(await tx.execute<{ j: Json }>(q))].map((r) => r.j);
const ids = async (tx: Tx, q: ReturnType<typeof sql>) => [...(await tx.execute<{ id: string }>(q))].map((r) => r.id);

/**
 * Merges `otherId` into `keepId`. Contact details are combined (emails, phones and profiles
 * unioned; for single fields the user picks which to keep). Everything you logged moves to
 * the kept person; where both had the same thing (a Space, a goal, a room), the kept one's
 * stays and the other's details fill its gaps. The other person is soft-deleted and points at
 * the kept one. Undo is available for 30 days.
 */
export async function mergePeople(tx: Tx, userId: string, input: { keepId: string; otherId: string; choices: MergeChoices; suggestionId?: string | null }): Promise<Result<{ suggestionId: string }>> {
  const { keepId, otherId } = input;
  if (keepId === otherId) return fail("Choose two different people.");
  const [keep] = await rows(tx, sql`select to_jsonb(p) - 'search' as j from people p where id = ${keepId} and deleted_at is null`);
  const [other] = await rows(tx, sql`select to_jsonb(p) - 'search' as j from people p where id = ${otherId} and deleted_at is null`);
  if (!keep || !other) return fail("One of them no longer exists.");

  const pick = (f: MergeField) => {
    const k = keep[f] as string | null;
    const o = other[f] as string | null;
    return input.choices[f] === "other" ? (o ?? k) : (k ?? o);
  };
  const union = (a: unknown, b: unknown) => [...new Set([...((a as string[]) ?? []), ...((b as string[]) ?? [])])];
  await tx
    .update(t.people)
    .set({
      name: pick("name") ?? (keep.name as string),
      company: pick("company"),
      position: pick("position"),
      city: pick("city"),
      birthday: pick("birthday"),
      emails: union(keep.emails, other.emails),
      phones: union(keep.phones, other.phones),
      socials: { ...((other.socials as Json) ?? {}), ...((keep.socials as Json) ?? {}) },
      externalRefs: { ...((other.external_refs as Json) ?? {}), ...((keep.external_refs as Json) ?? {}) },
    })
    .where(eq(t.people.id, keepId));

  const record: MergeRecord = {
    keepId,
    otherId,
    keep,
    other,
    movedMemberships: [],
    combinedMemberships: [],
    removed: [],
    moved: { interactions: [], commitments: [], goalLinks: [], eventPeople: [], linksFrom: [], linksTo: [], dossiers: [], scores: [] },
    at: new Date().toISOString(),
  };

  // 1. Spaces first, so the kept person is in every Space the other was (the database checks this for everything below).
  const otherMs = await rows(tx, sql`select to_jsonb(ps) as j from person_spaces ps where person_id = ${otherId}`);
  for (const m of otherMs) {
    const [mine] = await rows(tx, sql`select to_jsonb(ps) as j from person_spaces ps where person_id = ${keepId} and space_id = ${m.space_id as string}`);
    if (!mine) {
      await tx.execute(sql`update person_spaces set person_id = ${keepId} where id = ${m.id as string}`);
      record.movedMemberships.push(m.id as string);
      continue;
    }
    record.combinedMemberships.push(mine);
    await tx.execute(sql`
      update person_spaces k set
        where_met = coalesce(k.where_met, o.where_met),
        met_on = coalesce(k.met_on, o.met_on),
        notes = case when k.notes is null then o.notes when o.notes is null or o.notes = k.notes then k.notes else k.notes || E'\n\n' || o.notes end,
        opportunities = coalesce(k.opportunities, o.opportunities),
        interests = array(select distinct unnest(k.interests || o.interests)),
        tags = array(select distinct unnest(k.tags || o.tags)),
        circle_id = coalesce(k.circle_id, o.circle_id),
        cadence_days = coalesce(k.cadence_days, o.cadence_days),
        starred = k.starred or o.starred,
        triage_state = case when k.triage_state = 'done' or o.triage_state = 'done' then 'done' else 'pending' end,
        archived_at = case when k.archived_at is null or o.archived_at is null then null else k.archived_at end
      from person_spaces o where k.id = ${mine.id as string} and o.id = ${m.id as string}`);
  }

  // 2. What you logged.
  record.moved.interactions = await ids(tx, sql`update interactions set person_id = ${keepId} where person_id = ${otherId} returning id`);
  record.moved.commitments = await ids(tx, sql`update commitments set person_id = ${keepId} where person_id = ${otherId} returning id`);

  // 3. Goals, rooms and links: move, unless the kept person already has the same one.
  for (const g of await rows(tx, sql`select to_jsonb(gl) as j from goal_links gl where person_id = ${otherId}`)) {
    const [dup] = await ids(tx, sql`select id from goal_links where goal_id = ${g.goal_id as string} and person_id = ${keepId}`);
    if (dup) {
      record.removed.push({ table: "goal_links", row: g });
      await tx.execute(sql`delete from goal_links where id = ${g.id as string}`);
    } else {
      await tx.execute(sql`update goal_links set person_id = ${keepId} where id = ${g.id as string}`);
      record.moved.goalLinks.push(g.id as string);
    }
  }
  for (const e of await rows(tx, sql`select to_jsonb(ep) as j from event_people ep where person_id = ${otherId}`)) {
    const [dup] = await ids(tx, sql`select event_id as id from event_people where event_id = ${e.event_id as string} and person_id = ${keepId} and role = ${e.role as string}`);
    if (dup) {
      record.removed.push({ table: "event_people", row: e });
      await tx.execute(sql`delete from event_people where event_id = ${e.event_id as string} and person_id = ${otherId} and role = ${e.role as string}`);
    } else {
      await tx.execute(sql`update event_people set person_id = ${keepId} where event_id = ${e.event_id as string} and person_id = ${otherId} and role = ${e.role as string}`);
      record.moved.eventPeople.push({ eventId: e.event_id as string, role: e.role as string });
    }
  }
  for (const l of await rows(tx, sql`select to_jsonb(pl) as j from person_links pl where from_person_id = ${otherId} or to_person_id = ${otherId}`)) {
    const from = l.from_person_id === otherId ? keepId : (l.from_person_id as string);
    const to = l.to_person_id === otherId ? keepId : (l.to_person_id as string);
    const [dup] = from === to ? ["self"] : await ids(tx, sql`select id from person_links where from_person_id = ${from} and to_person_id = ${to} and kind = ${l.kind as string} and space_id = ${l.space_id as string}`);
    if (dup) {
      record.removed.push({ table: "person_links", row: l });
      await tx.execute(sql`delete from person_links where id = ${l.id as string}`);
    } else {
      await tx.execute(sql`update person_links set from_person_id = ${from}, to_person_id = ${to} where id = ${l.id as string}`);
      (l.from_person_id === otherId ? record.moved.linksFrom : record.moved.linksTo).push(l.id as string);
    }
  }
  record.moved.dossiers = await ids(
    tx,
    sql`update dossiers d set person_id = ${keepId} where d.person_id = ${otherId}
          and not exists (select 1 from dossiers k where k.person_id = ${keepId} and k.space_id = d.space_id and k.version = d.version) returning d.id`,
  );
  record.moved.scores = await ids(tx, sql`update scores set person_id = ${keepId} where person_id = ${otherId} returning id`);

  // 4. Memberships the kept person already had: the other's copy goes.
  for (const m of otherMs.filter((x) => !record.movedMemberships.includes(x.id as string))) {
    record.removed.push({ table: "person_spaces", row: m });
    await tx.execute(sql`delete from person_spaces where id = ${m.id as string}`);
  }
  await tx.update(t.people).set({ deletedAt: new Date(), mergedIntoId: keepId }).where(eq(t.people.id, otherId));

  // 5. The record that makes Undo possible.
  const payload = { personIds: [keepId, otherId], merge: record };
  let suggestionId = input.suggestionId ?? null;
  if (suggestionId) {
    await tx.update(t.suggestions).set({ status: "accepted", resolvedAt: new Date(), payload }).where(eq(t.suggestions.id, suggestionId));
  } else {
    const [s] = await tx
      .insert(t.suggestions)
      .values({ userId, kind: "merge", targetType: "person", targetId: keepId, payload, why: "Merged by you", origin: "manual", status: "accepted", resolvedAt: new Date() })
      .returning({ id: t.suggestions.id });
    suggestionId = s.id;
  }
  // Other suggestions about the merged-away person no longer apply.
  await tx
    .update(t.suggestions)
    .set({ status: "dismissed", resolvedAt: new Date() })
    .where(and(eq(t.suggestions.kind, "merge"), eq(t.suggestions.status, "pending"), sql`${t.suggestions.payload} -> 'personIds' ? ${otherId}`));
  return { ok: true, data: { suggestionId } };
}

/** Puts both people back exactly as they were before the merge. */
export async function undoMerge(tx: Tx, suggestionId: string): Promise<Result<null>> {
  const [s] = await tx.select().from(t.suggestions).where(and(eq(t.suggestions.id, suggestionId), eq(t.suggestions.status, "accepted")));
  const record = (s?.payload as { merge?: MergeRecord } | undefined)?.merge;
  if (!s || !record) return fail("That merge can't be undone any more.");
  const { keepId, otherId } = record;
  const restore = (table: string, row: Json) => tx.execute(sql`insert into ${sql.raw(table)} select * from jsonb_populate_record(null::${sql.raw(table)}, ${JSON.stringify(row)}::jsonb)`);
  const cols = ["name", "company", "position", "city", "birthday", "emails", "phones", "socials", "external_refs"];
  const colList = sql.raw(cols.join(", "));

  await tx.execute(sql`update people set deleted_at = null, merged_into_id = null where id = ${otherId}`);
  await tx.execute(sql`update people set (${colList}) = (select ${colList} from jsonb_populate_record(null::people, ${JSON.stringify(record.keep)}::jsonb)) where id = ${keepId}`);

  // Spaces back first, so everything else is allowed to move back.
  if (record.movedMemberships.length) await tx.update(t.personSpaces).set({ personId: otherId }).where(inArray(t.personSpaces.id, record.movedMemberships));
  for (const r of record.removed.filter((x) => x.table === "person_spaces")) await restore("person_spaces", r.row);
  for (const m of record.combinedMemberships) {
    const mcols = sql.raw("where_met, met_on, notes, opportunities, interests, tags, circle_id, cadence_days, starred, triage_state, archived_at");
    await tx.execute(sql`update person_spaces set (${mcols}) = (select ${mcols} from jsonb_populate_record(null::person_spaces, ${JSON.stringify(m)}::jsonb)) where id = ${m.id as string}`);
  }

  const back = (table: "interactions" | "commitments" | "goal_links" | "dossiers" | "scores", list: string[]) =>
    list.length ? tx.execute(sql`update ${sql.raw(table)} set person_id = ${otherId} where id in (${sql.join(list.map((x) => sql`${x}::uuid`), sql`, `)})`) : null;
  await back("interactions", record.moved.interactions);
  await back("commitments", record.moved.commitments);
  await back("goal_links", record.moved.goalLinks);
  await back("dossiers", record.moved.dossiers);
  await back("scores", record.moved.scores);
  for (const e of record.moved.eventPeople) await tx.execute(sql`update event_people set person_id = ${otherId} where event_id = ${e.eventId} and person_id = ${keepId} and role = ${e.role}`);
  for (const id of record.moved.linksFrom) await tx.execute(sql`update person_links set from_person_id = ${otherId} where id = ${id}`);
  for (const id of record.moved.linksTo) await tx.execute(sql`update person_links set to_person_id = ${otherId} where id = ${id}`);
  for (const r of record.removed.filter((x) => x.table !== "person_spaces")) await restore(r.table, r.row);

  await tx.update(t.suggestions).set({ status: "pending", resolvedAt: null, payload: { personIds: [keepId, otherId] } }).where(eq(t.suggestions.id, suggestionId));
  return { ok: true, data: null };
}

export type DuplicatePerson = {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  company: string | null;
  position: string | null;
  city: string | null;
  birthday: string | null;
  spaces: string[];
  touches: number;
  createdAt: Date;
};

/** Pending "possible duplicate" pairs where both people still exist. */
export async function listDuplicates(tx: Tx, limit = 50) {
  const pending = await tx
    .select({ id: t.suggestions.id, payload: t.suggestions.payload, why: t.suggestions.why })
    .from(t.suggestions)
    .where(and(eq(t.suggestions.kind, "merge"), eq(t.suggestions.status, "pending")))
    .orderBy(desc(t.suggestions.createdAt))
    .limit(limit * 2);
  const personIds = [...new Set(pending.flatMap((s) => ((s.payload as { personIds?: string[] }).personIds ?? []).slice(0, 2)))];
  if (!personIds.length) return [];
  const people = await tx
    .select({
      p: t.people,
      spaces: sql<string[]>`coalesce((select array_agg(s.name order by s.position) from person_spaces ps join spaces s on s.id = ps.space_id where ps.person_id = people.id), '{}')`,
      touches: sql<number>`(select count(*)::int from interactions i where i.person_id = people.id)`,
    })
    .from(t.people)
    .where(and(inArray(t.people.id, personIds), isNull(t.people.deletedAt)));
  const byId = new Map(
    people.map(({ p, spaces, touches }) => [
      p.id,
      { id: p.id, name: p.name, emails: p.emails, phones: p.phones, company: p.company, position: p.position, city: p.city, birthday: p.birthday, spaces, touches, createdAt: p.createdAt } satisfies DuplicatePerson,
    ]),
  );
  return pending
    .map((s) => {
      const [a, b] = ((s.payload as { personIds?: string[] }).personIds ?? []).map((id) => byId.get(id));
      return a && b ? { suggestionId: s.id, why: s.why ?? "", a, b } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, limit);
}

export async function countDuplicates(tx: Tx) {
  const [r] = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from suggestions s
     where s.kind = 'merge' and s.status = 'pending'
       and (select count(*) from people p where p.id::text in (select jsonb_array_elements_text(s.payload -> 'personIds')) and p.deleted_at is null) >= 2`);
  return r?.n ?? 0;
}

export async function dismissDuplicate(tx: Tx, suggestionId: string) {
  await tx.update(t.suggestions).set({ status: "dismissed", resolvedAt: new Date() }).where(and(eq(t.suggestions.id, suggestionId), eq(t.suggestions.kind, "merge")));
}

/** Merges from the last 30 days, newest first, for Undo. */
export async function recentMerges(tx: Tx) {
  const rows = await tx
    .select({ id: t.suggestions.id, payload: t.suggestions.payload, resolvedAt: t.suggestions.resolvedAt })
    .from(t.suggestions)
    .where(and(eq(t.suggestions.kind, "merge"), eq(t.suggestions.status, "accepted"), gte(t.suggestions.resolvedAt, new Date(Date.now() - 30 * 86_400_000))))
    .orderBy(desc(t.suggestions.resolvedAt))
    .limit(20);
  return rows.flatMap((r) => {
    const m = (r.payload as { merge?: MergeRecord }).merge;
    return m ? [{ suggestionId: r.id, keptName: String(m.keep.name), otherName: String(m.other.name), keepId: m.keepId, at: r.resolvedAt! }] : [];
  });
}
