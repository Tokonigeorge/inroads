import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  defaultSpaceDefaults,
  finaliseStages,
  MAX_SPACES,
  researchModeAllowed,
  spaceDefaultsSchema,
  type SpaceDefaults,
  type SpaceKind,
  type UpdateSpaceInput,
} from "@/contracts/spaces";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";

/** Expected failures a form can show next to a field; anything else is a bug and throws. */
export type Result<T> = { ok: true; data: T } | { ok: false; field?: string; message: string };
const fail = (message: string, field?: string): Result<never> => ({ ok: false, message, field });

export type SpaceRow = typeof t.spaces.$inferSelect & { defaults: SpaceDefaults; people: number };

function parseDefaults(row: typeof t.spaces.$inferSelect): SpaceDefaults {
  const parsed = spaceDefaultsSchema.safeParse(row.defaults);
  return parsed.success ? parsed.data : defaultSpaceDefaults[row.kind as SpaceKind];
}

const peopleCount = sql<number>`(
  select count(*)::int from person_spaces ps
   join people p on p.id = ps.person_id
  where ps.space_id = spaces.id and ps.archived_at is null and p.deleted_at is null
)`;

export async function listSpaces(tx: Tx, opts: { includeArchived?: boolean } = {}): Promise<SpaceRow[]> {
  const rows = await tx
    .select({ space: t.spaces, people: peopleCount })
    .from(t.spaces)
    .where(opts.includeArchived ? undefined : isNull(t.spaces.archivedAt))
    .orderBy(asc(t.spaces.position), asc(t.spaces.createdAt));
  return rows.map((r) => ({ ...r.space, defaults: parseDefaults(r.space), people: r.people }));
}

export async function getSpace(tx: Tx, id: string): Promise<SpaceRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await tx.select({ space: t.spaces, people: peopleCount }).from(t.spaces).where(eq(t.spaces.id, id));
  return r ? { ...r.space, defaults: parseDefaults(r.space), people: r.people } : null;
}

export async function createSpace(tx: Tx, userId: string, input: { name: string; kind: SpaceKind }): Promise<Result<SpaceRow>> {
  const existing = await tx.select({ name: t.spaces.name, position: t.spaces.position }).from(t.spaces);
  if (existing.length >= MAX_SPACES) return fail(`You can have up to ${MAX_SPACES} Spaces. Archive one you don't use first.`);
  if (existing.some((s) => s.name.toLowerCase() === input.name.toLowerCase())) {
    return fail("You already have a Space with that name.", "name");
  }
  const position = Math.max(-1, ...existing.map((s) => s.position)) + 1;
  const [row] = await tx
    .insert(t.spaces)
    .values({ userId, name: input.name, kind: input.kind, position, defaults: defaultSpaceDefaults[input.kind] })
    .returning();
  return { ok: true, data: { ...row, defaults: parseDefaults(row), people: 0 } };
}

/**
 * Pipeline stages in use: goal links whose goal inherits this Space's stages. Removing one of
 * these keys would strand people in a stage that no longer exists.
 */
async function stagesInUse(tx: Tx, spaceId: string) {
  return tx
    .select({ stage: t.goalLinks.stage, n: sql<number>`count(*)::int` })
    .from(t.goalLinks)
    .innerJoin(t.goals, eq(t.goals.id, t.goalLinks.goalId))
    .where(and(eq(t.goals.spaceId, spaceId), isNull(t.goals.stages)))
    .groupBy(t.goalLinks.stage);
}

export async function updateSpace(tx: Tx, id: string, input: UpdateSpaceInput): Promise<Result<SpaceRow>> {
  const space = await getSpace(tx, id);
  if (!space) return fail("That Space doesn't exist any more.");
  if (!researchModeAllowed(space.kind as SpaceKind, input.researchMode)) {
    return fail("Full research is only available in Work Spaces.", "researchMode");
  }
  const others = await tx.select({ id: t.spaces.id, name: t.spaces.name }).from(t.spaces);
  if (others.some((s) => s.id !== id && s.name.toLowerCase() === input.name.toLowerCase())) {
    return fail("You already have a Space with that name.", "name");
  }

  const stages = finaliseStages(input.stages);
  const kept = new Set(stages.map((s) => s.key));
  const stranded = (await stagesInUse(tx, id)).filter((u) => !kept.has(u.stage));
  if (stranded.length) {
    const labels = stranded.map((u) => space.defaults.stages.find((s) => s.key === u.stage)?.label ?? u.stage);
    const people = stranded.reduce((n, u) => n + u.n, 0);
    return fail(
      `${people === 1 ? "1 person is" : `${people} people are`} at ${labels.map((l) => `"${l}"`).join(" and ")} in a goal. Move them to another stage before removing it.`,
      "stages",
    );
  }

  const defaults: SpaceDefaults = spaceDefaultsSchema.parse({ cadenceDays: input.cadenceDays, researchMode: input.researchMode, stages });
  const [row] = await tx.update(t.spaces).set({ name: input.name, defaults }).where(eq(t.spaces.id, id)).returning();
  return { ok: true, data: { ...row, defaults, people: space.people } };
}

export async function setSpaceArchived(tx: Tx, id: string, archived: boolean): Promise<Result<null>> {
  if (archived) {
    const active = await tx.select({ id: t.spaces.id }).from(t.spaces).where(isNull(t.spaces.archivedAt));
    if (active.length <= 1 && active[0]?.id === id) return fail("You need at least one active Space.");
  }
  const updated = await tx
    .update(t.spaces)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(t.spaces.id, id))
    .returning({ id: t.spaces.id });
  return updated.length ? { ok: true, data: null } : fail("That Space doesn't exist any more.");
}

/** Deleting only works for empty Spaces; anything with people, goals or rooms gets archived instead. */
export async function deleteSpace(tx: Tx, id: string): Promise<Result<null>> {
  const space = await getSpace(tx, id);
  if (!space) return fail("That Space doesn't exist any more.");
  const [use] = await tx
    .select({
      members: sql<number>`(select count(*)::int from ${t.personSpaces} where space_id = ${id})`,
      goals: sql<number>`(select count(*)::int from ${t.goals} where space_id = ${id})`,
      events: sql<number>`(select count(*)::int from ${t.events} where space_id = ${id})`,
    })
    .from(sql`(select 1) as one`);
  if (use.members + use.goals + use.events > 0) {
    return fail("This Space has people, goals or rooms in it. Archive it instead, which hides it and keeps everything.");
  }
  const all = await tx.select({ id: t.spaces.id }).from(t.spaces).where(isNull(t.spaces.archivedAt));
  if (all.length <= 1 && all[0]?.id === id) return fail("You need at least one active Space.");
  await tx.delete(t.spaces).where(eq(t.spaces.id, id));
  return { ok: true, data: null };
}

/** Saves a new order for the active Spaces (ids not listed keep their place after them). */
export async function reorderSpaces(tx: Tx, ids: string[]) {
  const rows = await tx.select({ id: t.spaces.id }).from(t.spaces).where(inArray(t.spaces.id, ids));
  const known = new Set(rows.map((r) => r.id));
  let position = 0;
  for (const id of ids) if (known.has(id)) await tx.update(t.spaces).set({ position: position++ }).where(eq(t.spaces.id, id));
}
