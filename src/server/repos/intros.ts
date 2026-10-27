import "server-only";
import { firstIssue } from "@/contracts/issues";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { introRequestSchema, type IntroRequestInput } from "@/contracts/people";
import { addDays, type IsoDate } from "@/domain/dates";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { goalWithStages } from "./goals";
import type { Result } from "./spaces";
import { strengthSql } from "./strength";

const fail = (message: string, field?: string): Result<never> => ({ ok: false, message, field });
const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;
const linkReason: Record<string, string> = {
  introduced_by: "Introduced you",
  works_with: "Works with them",
  knows: "Knows them",
  family: "Family",
  partner: "Their partner",
};

export type WarmPath = {
  personId: string;
  name: string;
  detail: string;
  reasons: string[];
  phone: string | null;
  email: string | null;
  /** How strong your own relationship with them is, 0–100 (null: never been in touch). */
  strength: number | null;
};

/**
 * Who in this Space could introduce you to someone, and why: people you've linked to them,
 * people at the same company, and people you've seen at the same rooms. Ranked like Affinity's
 * warm-intro paths: how strong your own relationship with the introducer is first (asking
 * someone you barely know rarely works), then how much evidence connects them.
 */
export async function warmPaths(tx: Tx, targetId: string, spaceId: string, today: IsoDate): Promise<WarmPath[]> {
  const [target] = await tx.select({ company: t.people.company }).from(t.people).where(eq(t.people.id, targetId));
  if (!target) return [];
  const member = sql`exists (select 1 from person_spaces ps where ps.person_id = people.id and ps.space_id = ${spaceId} and ps.archived_at is null)`;
  const [links, colleagues, rooms] = await Promise.all([
    tx
      .select({ id: t.people.id, kind: t.personLinks.kind, note: t.personLinks.note })
      .from(t.personLinks)
      .innerJoin(t.people, or(and(eq(t.personLinks.fromPersonId, targetId), eq(t.people.id, t.personLinks.toPersonId)), and(eq(t.personLinks.toPersonId, targetId), eq(t.people.id, t.personLinks.fromPersonId))))
      .where(and(eq(t.personLinks.spaceId, spaceId), isNull(t.people.deletedAt))),
    target.company
      ? tx
          .select({ id: t.people.id, company: t.people.company })
          .from(t.people)
          .where(and(ne(t.people.id, targetId), isNull(t.people.deletedAt), sql`lower(people.company) = lower(${target.company})`, member))
          .limit(10)
      : Promise.resolve([]),
    tx.execute<{ id: string; title: string }>(sql`
      select distinct on (other.person_id) other.person_id as id, e.title
      from event_people mine
      join event_people other on other.event_id = mine.event_id and other.person_id <> mine.person_id
      join events e on e.id = mine.event_id and e.space_id = ${spaceId} and e.deleted_at is null
      join people p on p.id = other.person_id and p.deleted_at is null
      where mine.person_id = ${targetId}
      order by other.person_id, e.starts_on desc
      limit 10`),
  ]);
  const reasons = new Map<string, string[]>();
  const add = (id: string, why: string) => reasons.set(id, [...(reasons.get(id) ?? []), why]);
  for (const l of links) add(l.id, l.note ? `${linkReason[l.kind] ?? "Knows them"}: ${l.note}` : (linkReason[l.kind] ?? "Knows them"));
  for (const c of colleagues) add(c.id, `Also at ${c.company}`);
  for (const r of rooms) add(r.id, `Both linked to ${r.title}`);
  reasons.delete(targetId);
  if (!reasons.size) return [];
  const people = await tx
    .select({
      id: t.people.id,
      name: t.people.name,
      company: t.people.company,
      position: t.people.position,
      phones: t.people.phones,
      emails: t.people.emails,
      strength: sql<number | null>`case when ${t.people.lastTouchedOn} is null then null else ${strengthSql(sql`${t.people.lastTouchedOn}`, sql`${t.people.id}`, today)} end`,
    })
    .from(t.people)
    .where(and(inArray(t.people.id, [...reasons.keys()]), isNull(t.people.deletedAt), member))
    .orderBy(asc(t.people.name));
  return people
    .map((p) => ({ personId: p.id, name: p.name, detail: [p.position, p.company].filter(Boolean).join(" at "), reasons: reasons.get(p.id)!, phone: p.phones[0] ?? null, email: p.emails[0] ?? null, strength: p.strength }))
    .sort((a, b) => (b.strength ?? -1) - (a.strength ?? -1) || b.reasons.length - a.reasons.length || a.name.localeCompare(b.name))
    .slice(0, 8);
}

/** Moves someone forward on a goal to `stageKey` if the goal has that stage and they're behind it. */
async function advanceTo(tx: Tx, userId: string, goalId: string, personId: string, stageKey: string) {
  const g = await goalWithStages(tx, goalId);
  if (!g) return;
  const target = g.stages.findIndex((s) => s.key === stageKey);
  const [link] = await tx.select({ id: t.goalLinks.id, stage: t.goalLinks.stage }).from(t.goalLinks).where(and(eq(t.goalLinks.goalId, goalId), eq(t.goalLinks.personId, personId)));
  if (!link) {
    const first = g.stages.find((s) => !s.closed)?.key ?? g.stages[0]?.key;
    const at = target >= 0 ? stageKey : first;
    if (at) await tx.insert(t.goalLinks).values({ userId, goalId, personId, stage: at }).onConflictDoNothing();
    return;
  }
  const current = g.stages.findIndex((s) => s.key === link.stage);
  if (target > current) await tx.update(t.goalLinks).set({ stage: stageKey, updatedAt: new Date() }).where(eq(t.goalLinks.id, link.id));
}

/**
 * You asked someone for an intro: it's tracked as a promise they owe you ("Intro to Tunde"),
 * with a touch logged for the ask, and the person you want to meet moves to "Warm path found"
 * on the goal (added to it if needed).
 */
export async function requestIntro(tx: Tx, userId: string, raw: IntroRequestInput, today: IsoDate): Promise<Result<{ id: string }>> {
  const parsed = introRequestSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error, "Check the details."));
  const d = parsed.data;
  if (d.targetId === d.connectorId) return fail("Choose someone else to make the intro.");
  const names = await tx.select({ id: t.people.id, name: t.people.name }).from(t.people).where(and(inArray(t.people.id, [d.targetId, d.connectorId]), isNull(t.people.deletedAt)));
  const target = names.find((n) => n.id === d.targetId);
  const connector = names.find((n) => n.id === d.connectorId);
  if (!target || !connector) return fail("They're no longer in Inroads.");
  const members = await tx
    .select({ personId: t.personSpaces.personId })
    .from(t.personSpaces)
    .where(and(eq(t.personSpaces.spaceId, d.spaceId), inArray(t.personSpaces.personId, [d.targetId, d.connectorId])));
  if (members.length < 2) return fail("Both people need to be in this Space.");
  if (d.goalId) {
    const [g] = await tx.select({ spaceId: t.goals.spaceId }).from(t.goals).where(eq(t.goals.id, d.goalId));
    if (g?.spaceId !== d.spaceId) return fail("Choose a goal in this Space.", "goalId");
  }
  const [open] = await tx
    .select({ id: t.commitments.id })
    .from(t.commitments)
    .where(and(eq(t.commitments.kind, "intro"), eq(t.commitments.personId, d.connectorId), eq(t.commitments.aboutPersonId, d.targetId), isNull(t.commitments.doneAt)));
  if (open) return fail(`You've already asked ${firstName(connector.name)} for this intro.`);

  const [touch] = await tx
    .insert(t.interactions)
    .values({ userId, personId: d.connectorId, spaceId: d.spaceId, occurredOn: today, type: "message", summary: `Asked for an intro to ${target.name}` })
    .returning({ id: t.interactions.id });
  const [c] = await tx
    .insert(t.commitments)
    .values({ userId, personId: d.connectorId, spaceId: d.spaceId, text: `Introduce you to ${target.name}`, owner: "them", dueOn: addDays(today, d.dueInDays), kind: "intro", aboutPersonId: d.targetId, goalId: d.goalId, interactionId: touch.id })
    .returning({ id: t.commitments.id });
  if (d.goalId) await advanceTo(tx, userId, d.goalId, d.targetId, "warm_path");
  return { ok: true, data: { id: c.id } };
}

/**
 * When an intro promise is ticked done: remember who introduced you (a person link, which
 * powers future warm paths) and move them to "Introduced" on the goal.
 */
export async function completeIntro(tx: Tx, userId: string, commitmentId: string) {
  const [c] = await tx.select().from(t.commitments).where(eq(t.commitments.id, commitmentId));
  if (!c || c.kind !== "intro" || !c.aboutPersonId) return;
  await tx
    .insert(t.personLinks)
    .values({ userId, fromPersonId: c.aboutPersonId, toPersonId: c.personId, kind: "introduced_by", spaceId: c.spaceId })
    .onConflictDoNothing();
  if (c.goalId) await advanceTo(tx, userId, c.goalId, c.aboutPersonId, "introduced");
}

/** Intro requests about this person (asked, and made), newest first. */
export async function introsAbout(tx: Tx, personId: string) {
  return tx
    .select({ id: t.commitments.id, connectorId: t.people.id, connector: t.people.name, dueOn: t.commitments.dueOn, doneAt: t.commitments.doneAt, spaceId: t.commitments.spaceId })
    .from(t.commitments)
    .innerJoin(t.people, eq(t.people.id, t.commitments.personId))
    .where(and(eq(t.commitments.kind, "intro"), eq(t.commitments.aboutPersonId, personId), isNull(t.people.deletedAt)))
    .orderBy(desc(t.commitments.createdAt));
}
