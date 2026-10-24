import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { defaultSpaceDefaults, spaceDefaultsSchema, type SpaceKind } from "@/contracts/spaces";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";

/**
 * Everything an AI prompt may know, scoped to exactly one Space (docs/TECH_PLAN.md §4.7).
 *
 * The rule: shared identity (name, contact details, company, role, city, birthday, socials,
 * overall last-touch date) can appear in any Space the person belongs to. Relationship
 * context (notes, tags, where you met, touches, promises, goals, research) only comes from
 * the requested Space. Every AI feature must build its prompt from these loaders and nothing
 * else, so a Dating note can never reach a Work brief.
 */

export type SpaceContext = Awaited<ReturnType<typeof loadSpaceContext>>;
export type PersonContext = NonNullable<Awaited<ReturnType<typeof loadPersonContext>>>;

export async function loadSpaceContext(tx: Tx, spaceId: string) {
  const [space] = await tx.select().from(t.spaces).where(eq(t.spaces.id, spaceId));
  if (!space) throw new Error("Space not found");
  const defaults = spaceDefaultsSchema.safeParse(space.defaults);
  const goals = await tx
    .select({ id: t.goals.id, text: t.goals.text, type: t.goals.type, priority: t.goals.priority, weeklyTarget: t.goals.weeklyTarget })
    .from(t.goals)
    .where(and(eq(t.goals.spaceId, spaceId), eq(t.goals.active, true), isNull(t.goals.archivedAt)))
    .orderBy(asc(t.goals.priority));
  return {
    space: { id: space.id, name: space.name, kind: space.kind as SpaceKind },
    researchMode: (defaults.success ? defaults.data : defaultSpaceDefaults[space.kind as SpaceKind]).researchMode,
    goals,
  };
}

/** A compact list of the people in one Space, for prompts that need "my network". */
export async function loadNetworkDigest(tx: Tx, spaceId: string, limit = 180) {
  return tx
    .select({
      id: t.people.id,
      name: t.people.name,
      position: t.people.position,
      company: t.people.company,
      whereMet: t.personSpaces.whereMet,
      tags: t.personSpaces.tags,
      interests: t.personSpaces.interests,
    })
    .from(t.personSpaces)
    .innerJoin(t.people, eq(t.people.id, t.personSpaces.personId))
    .where(and(eq(t.personSpaces.spaceId, spaceId), isNull(t.personSpaces.archivedAt), isNull(t.people.deletedAt)))
    .orderBy(desc(t.personSpaces.starred), asc(t.people.name))
    .limit(limit);
}

/** One person as seen from one Space, or null if they aren't in it. */
export async function loadPersonContext(tx: Tx, spaceId: string, personId: string) {
  const [row] = await tx
    .select({ person: t.people, membership: t.personSpaces })
    .from(t.personSpaces)
    .innerJoin(t.people, eq(t.people.id, t.personSpaces.personId))
    .where(and(eq(t.personSpaces.spaceId, spaceId), eq(t.personSpaces.personId, personId), isNull(t.people.deletedAt)));
  if (!row) return null;
  const { person: p, membership: m } = row;

  const [touches, promises, goalLinks, dossier] = await Promise.all([
    tx
      .select({ date: t.interactions.occurredOn, type: t.interactions.type, summary: t.interactions.summary })
      .from(t.interactions)
      .where(and(eq(t.interactions.personId, personId), eq(t.interactions.spaceId, spaceId)))
      .orderBy(desc(t.interactions.occurredOn))
      .limit(8),
    tx
      .select({ text: t.commitments.text, owner: t.commitments.owner, due: t.commitments.dueOn })
      .from(t.commitments)
      .where(and(eq(t.commitments.personId, personId), eq(t.commitments.spaceId, spaceId), isNull(t.commitments.doneAt))),
    tx
      .select({ goal: t.goals.text, stage: t.goalLinks.stage })
      .from(t.goalLinks)
      .innerJoin(t.goals, eq(t.goals.id, t.goalLinks.goalId))
      .where(and(eq(t.goalLinks.personId, personId), eq(t.goals.spaceId, spaceId))),
    tx
      .select({ version: t.dossiers.version, mode: t.dossiers.mode, payload: t.dossiers.payload, createdAt: t.dossiers.createdAt })
      .from(t.dossiers)
      .where(and(eq(t.dossiers.personId, personId), eq(t.dossiers.spaceId, spaceId)))
      .orderBy(desc(t.dossiers.version))
      .limit(1),
  ]);

  return {
    identity: {
      id: p.id,
      name: p.name,
      emails: p.emails,
      phones: p.phones,
      company: p.company,
      position: p.position,
      city: p.city,
      birthday: p.birthday,
      socials: p.socials as Record<string, string>,
      lastTouchedOn: p.lastTouchedOn,
    },
    relationship: {
      whereMet: m.whereMet,
      metOn: m.metOn,
      interests: m.interests,
      notes: m.notes,
      opportunities: m.opportunities,
      tags: m.tags,
      starred: m.starred,
      lastTouchedHereOn: m.lastTouchedOn,
    },
    touches,
    promises,
    goals: goalLinks,
    research: dossier[0] ?? null,
  };
}
