import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import {
  createPersonSchema,
  membershipSchema,
  peopleQuerySchema,
  personIdentitySchema,
  promiseSchema,
  touchSchema,
  type CreatePersonInput,
  type MembershipInput,
  type PeopleQuery,
  type PersonIdentityInput,
  type PromiseInput,
  type TouchInput,
} from "@/contracts/people";
import { defaultSpaceDefaults, spaceDefaultsSchema, type SpaceKind } from "@/contracts/spaces";
import type { IsoDate } from "@/domain/dates";
import { normaliseContactLists } from "@/domain/normalise";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import type { Result } from "./spaces";

const fail = (message: string, field?: string): Result<never> => ({ ok: false, message, field });

async function profileRegion(tx: Tx) {
  const [p] = await tx.select({ region: t.profiles.defaultRegion }).from(t.profiles);
  return p?.region ?? "NG";
}

/* ======================================================================= list */

export type PersonListItem = {
  id: string;
  name: string;
  company: string | null;
  position: string | null;
  lastTouchedOn: IsoDate | null;
  starred: boolean;
  cadenceDays: number | null;
  dueOn: IsoDate | null;
  unsorted: boolean;
  spaces: { id: string; name: string }[];
};

type Cursor = { k: string; id: string };
const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString());
    return typeof c?.k === "string" && /^[0-9a-f-]{36}$/i.test(c?.id) ? c : null;
  } catch {
    return null;
  }
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/**
 * One row per person with their memberships rolled up: priority flag, the shortest reminder
 * (person → circle → Space default; 0 means never), latest anchor, and the date they're due
 * (`r_due_on`). Shared by the People list and Today's reminders so "due" means one thing.
 */
export function personRollup(membershipWhere: SQL[], having: SQL[] = [sql`true`]) {
  return sql`
    with m as (
      select ps.person_id,
             bool_or(ps.starred) as starred,
             min(nullif(coalesce(ps.cadence_days, c.default_cadence_days, (s.defaults ->> 'cadenceDays')::int), 0)) as cadence,
             max(ps.cadence_anchor_on) as anchor,
             bool_or(ps.triage_state = 'pending') as unsorted,
             bool_and(ps.where_met is null and cardinality(ps.interests) = 0) as needs_context,
             array_agg(s.name order by s.position) as spaces,
             array_agg(s.id order by s.position) as space_ids
        from person_spaces ps
        join spaces s on s.id = ps.space_id and s.archived_at is null
        left join circles c on c.id = ps.circle_id
       where ${sql.join(membershipWhere, sql` and `)}
       group by ps.person_id
      having ${sql.join(having, sql` and `)}
    ),
    base as (
      select p.*, m.starred, m.cadence, m.unsorted, m.spaces, m.space_ids, m.needs_context,
             case when m.cadence is null then null
                  else coalesce(p.last_touched_on, m.anchor, (p.created_at at time zone 'UTC')::date) + m.cadence end as r_due_on
        from people p join m on m.person_id = p.id
    )`;
}

/**
 * Keyset-paginated people list, built for 5,000+ rows. One row per person; with a Space
 * selected only that Space's membership counts, with "All spaces" the shortest reminder and
 * any priority flag across their Spaces apply.
 */
export async function listPeople(tx: Tx, rawQuery: PeopleQuery, today: IsoDate) {
  const q = peopleQuerySchema.parse(rawQuery);
  const archivedView = q.filter === "archived";

  const membershipWhere: SQL[] = [sql`true`];
  if (q.spaceId) membershipWhere.push(sql`ps.space_id = ${q.spaceId}`);
  if (!archivedView) membershipWhere.push(sql`ps.archived_at is null`);

  const having: SQL[] = [sql`true`];
  if (archivedView) having.push(sql`bool_and(ps.archived_at is not null)`);
  if (q.tag) having.push(sql`bool_or(${q.tag} = any(ps.tags))`);
  if (q.circleId) having.push(sql`bool_or(ps.circle_id = ${q.circleId})`);

  const where: SQL[] = [sql`p.deleted_at is null`];
  if (q.q) {
    const like = `%${escapeLike(q.q)}%`;
    const digits = q.q.replace(/\D/g, "");
    where.push(sql`(
      p.name ilike ${like} or p.company ilike ${like} or p.position ilike ${like} or p.city ilike ${like}
      or array_to_string(p.emails, ' ') ilike ${like}
      ${digits.length >= 4 ? sql`or array_to_string(p.phones, ' ') like ${`%${digits}%`}` : sql``}
      or exists (
        select 1 from person_spaces ps2
        where ps2.person_id = p.id ${q.spaceId ? sql`and ps2.space_id = ${q.spaceId}` : sql``}
          and (ps2.where_met ilike ${like} or ps2.notes ilike ${like} or array_to_string(ps2.tags, ' ') ilike ${like})
      )
    )`);
  }
  if (q.filter === "starred") where.push(sql`p.starred`);
  if (q.filter === "due") where.push(sql`p.r_due_on <= ${today}::date`);
  if (q.filter === "context") where.push(sql`p.needs_context`);
  if (q.filter === "untouched") where.push(sql`p.last_touched_on is null`);
  if (q.filter === "unsorted") where.push(sql`p.unsorted`);

  // Sort key as text so one keyset comparison works for every sort.
  const sorts = {
    name: { key: sql`lower(p.name)`, dir: "asc" },
    recent: { key: sql`coalesce(p.last_touched_on, '0001-01-01'::date)::text`, dir: "desc" },
    due: { key: sql`coalesce(p.r_due_on, '9999-12-31'::date)::text`, dir: "asc" },
    added: { key: sql`to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`, dir: "desc" },
  } as const;
  const sort = sorts[q.sort];
  const cursor = decodeCursor(q.cursor);
  const keyset = cursor
    ? sort.dir === "asc"
      ? sql`and (sort_key, id) > (${cursor.k}, ${cursor.id}::uuid)`
      : sql`and (sort_key, id) < (${cursor.k}, ${cursor.id}::uuid)`
    : sql``;
  const order = sort.dir === "asc" ? sql`sort_key asc, id asc` : sql`sort_key desc, id desc`;

  const rows = await tx.execute<{
    id: string;
    name: string;
    company: string | null;
    position: string | null;
    last_touched_on: string | null;
    starred: boolean;
    cadence: number | null;
    due_on: string | null;
    unsorted: boolean;
    spaces: string[];
    space_ids: string[];
    sort_key: string;
  }>(sql`
    ${personRollup(membershipWhere, having)}
    select p.id, p.name, p.company, p.position, p.last_touched_on::text as last_touched_on, p.starred, p.cadence,
           p.r_due_on::text as due_on, p.unsorted, p.spaces, p.space_ids, p.sort_key
      from (select p.*, ${sort.key} as sort_key from base p where ${sql.join(where, sql` and `)}) p
     where true ${keyset}
     order by ${order}
     limit ${q.limit + 1}
  `);

  const list = [...rows];
  const more = list.length > q.limit;
  const page = list.slice(0, q.limit);
  const items: PersonListItem[] = page.map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company,
    position: r.position,
    lastTouchedOn: r.last_touched_on,
    starred: r.starred,
    cadenceDays: r.cadence,
    dueOn: r.due_on,
    unsorted: r.unsorted,
    spaces: r.spaces.map((name, i) => ({ id: r.space_ids[i], name })),
  }));
  const last = page.at(-1);
  return { items, nextCursor: more && last ? encodeCursor({ k: last.sort_key, id: last.id }) : null };
}

/* ======================================================================= detail */

export async function getPerson(tx: Tx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [person] = await tx.select().from(t.people).where(and(eq(t.people.id, id), isNull(t.people.deletedAt)));
  if (!person) return null;

  const [memberships, touches, promises, goals] = await Promise.all([
    tx
      .select({ m: t.personSpaces, space: t.spaces, circle: t.circles })
      .from(t.personSpaces)
      .innerJoin(t.spaces, eq(t.spaces.id, t.personSpaces.spaceId))
      .leftJoin(t.circles, eq(t.circles.id, t.personSpaces.circleId))
      .where(eq(t.personSpaces.personId, id))
      .orderBy(asc(t.spaces.position)),
    tx
      .select({ i: t.interactions, spaceName: t.spaces.name })
      .from(t.interactions)
      .innerJoin(t.spaces, eq(t.spaces.id, t.interactions.spaceId))
      .where(eq(t.interactions.personId, id))
      .orderBy(desc(t.interactions.occurredOn), desc(t.interactions.createdAt))
      .limit(100),
    tx
      .select({ c: t.commitments, spaceName: t.spaces.name })
      .from(t.commitments)
      .innerJoin(t.spaces, eq(t.spaces.id, t.commitments.spaceId))
      .where(eq(t.commitments.personId, id))
      .orderBy(sql`${t.commitments.doneAt} is not null`, asc(t.commitments.dueOn), desc(t.commitments.createdAt))
      .limit(100),
    tx
      .select({ link: t.goalLinks, goal: t.goals })
      .from(t.goalLinks)
      .innerJoin(t.goals, eq(t.goals.id, t.goalLinks.goalId))
      .where(eq(t.goalLinks.personId, id)),
  ]);

  return {
    person,
    memberships: memberships.map(({ m, space, circle }) => {
      const defaults = spaceDefaultsSchema.safeParse(space.defaults);
      return {
        ...m,
        space: { id: space.id, name: space.name, kind: space.kind as SpaceKind, archived: Boolean(space.archivedAt) },
        spaceDefaults: defaults.success ? defaults.data : defaultSpaceDefaults[space.kind as SpaceKind],
        circle: circle ? { id: circle.id, name: circle.name, defaultCadenceDays: circle.defaultCadenceDays } : null,
      };
    }),
    touches: touches.map(({ i, spaceName }) => ({ ...i, spaceName })),
    promises: promises.map(({ c, spaceName }) => ({ ...c, spaceName })),
    goals: goals.map(({ link, goal }) => ({ ...link, goalText: goal.text, goalSpaceId: goal.spaceId, goalStages: goal.stages })),
  };
}
export type PersonDetail = NonNullable<Awaited<ReturnType<typeof getPerson>>>;

/* ======================================================================= people */

function normaliseIdentity(input: PersonIdentityInput, region: string): Result<ReturnType<typeof personIdentitySchema.parse> & { emails: string[]; phones: string[] }> {
  const parsed = personIdentitySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details.", String(parsed.error.issues[0]?.path[0] ?? ""));
  const lists = normaliseContactLists({ emails: parsed.data.emails, phones: parsed.data.phones }, region);
  const bad = lists.invalid[0];
  if (bad) {
    return fail(bad.field === "emails" ? `"${bad.value}" doesn't look like an email address.` : `"${bad.value}" doesn't look like a phone number.`, bad.field);
  }
  return { ok: true, data: { ...parsed.data, emails: lists.emails, phones: lists.phones } };
}

async function checkCircle(tx: Tx, circleId: string | null, spaceId: string): Promise<boolean> {
  if (!circleId) return true;
  const [c] = await tx.select({ spaceId: t.circles.spaceId }).from(t.circles).where(eq(t.circles.id, circleId));
  return c?.spaceId === spaceId;
}

/** Idempotent on `id`: replaying the same capture returns the existing person. */
export async function createPerson(tx: Tx, userId: string, raw: CreatePersonInput, today: IsoDate): Promise<Result<{ id: string; created: boolean }>> {
  const input = createPersonSchema.safeParse(raw);
  if (!input.success) return fail(input.error.issues[0]?.message ?? "Check the details.", String(input.error.issues[0]?.path.at(-1) ?? ""));
  const [existing] = await tx.select({ id: t.people.id }).from(t.people).where(eq(t.people.id, input.data.id));
  if (existing) return { ok: true, data: { id: existing.id, created: false } };

  const identity = normaliseIdentity(raw.identity, await profileRegion(tx));
  if (!identity.ok) return identity;
  const m = input.data.membership;
  const [space] = await tx.select({ id: t.spaces.id }).from(t.spaces).where(and(eq(t.spaces.id, m.spaceId), isNull(t.spaces.archivedAt)));
  if (!space) return fail("Choose one of your Spaces.", "spaceId");
  if (!(await checkCircle(tx, m.circleId, m.spaceId))) return fail("That circle belongs to a different Space.", "circleId");

  await tx.insert(t.people).values({ id: input.data.id, userId, ...identity.data, socials: identity.data.socials, source: "manual" });
  await tx.insert(t.personSpaces).values({ userId, personId: input.data.id, ...m, cadenceAnchorOn: today, triageState: "done" });
  return { ok: true, data: { id: input.data.id, created: true } };
}

export async function updatePersonIdentity(tx: Tx, id: string, raw: PersonIdentityInput): Promise<Result<null>> {
  const identity = normaliseIdentity(raw, await profileRegion(tx));
  if (!identity.ok) return identity;
  const updated = await tx
    .update(t.people)
    .set({ ...identity.data, socials: identity.data.socials })
    .where(and(eq(t.people.id, id), isNull(t.people.deletedAt)))
    .returning({ id: t.people.id });
  return updated.length ? { ok: true, data: null } : fail("This person no longer exists.");
}

/** Adds the person to a Space, or updates their relationship details there. */
export async function saveMembership(tx: Tx, userId: string, personId: string, raw: MembershipInput, today: IsoDate): Promise<Result<null>> {
  const parsed = membershipSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details.", String(parsed.error.issues[0]?.path[0] ?? ""));
  const m = parsed.data;
  if (!(await checkCircle(tx, m.circleId, m.spaceId))) return fail("That circle belongs to a different Space.", "circleId");
  const [existing] = await tx
    .select({ id: t.personSpaces.id })
    .from(t.personSpaces)
    .where(and(eq(t.personSpaces.personId, personId), eq(t.personSpaces.spaceId, m.spaceId)));
  if (existing) {
    await tx.update(t.personSpaces).set({ ...m, triageState: "done" }).where(eq(t.personSpaces.id, existing.id));
  } else {
    const [space] = await tx.select({ id: t.spaces.id }).from(t.spaces).where(and(eq(t.spaces.id, m.spaceId), isNull(t.spaces.archivedAt)));
    if (!space) return fail("Choose one of your Spaces.", "spaceId");
    await tx.insert(t.personSpaces).values({ userId, personId, ...m, cadenceAnchorOn: today, triageState: "done" });
  }
  return { ok: true, data: null };
}

/**
 * Takes a person out of one Space, deleting what you recorded about them there (touches,
 * promises, pipeline positions, research). They stay in their other Spaces.
 */
export async function removeFromSpace(tx: Tx, personId: string, spaceId: string): Promise<Result<null>> {
  const rows = await tx.select({ spaceId: t.personSpaces.spaceId }).from(t.personSpaces).where(eq(t.personSpaces.personId, personId));
  if (!rows.some((r) => r.spaceId === spaceId)) return fail("They're not in that Space.");
  if (rows.length <= 1) return fail("This is their only Space. Archive or delete them instead.");
  await tx.delete(t.interactions).where(and(eq(t.interactions.personId, personId), eq(t.interactions.spaceId, spaceId)));
  await tx.delete(t.commitments).where(and(eq(t.commitments.personId, personId), eq(t.commitments.spaceId, spaceId)));
  await tx.delete(t.dossiers).where(and(eq(t.dossiers.personId, personId), eq(t.dossiers.spaceId, spaceId)));
  await tx.delete(t.personLinks).where(and(eq(t.personLinks.spaceId, spaceId), sql`(${t.personLinks.fromPersonId} = ${personId} or ${t.personLinks.toPersonId} = ${personId})`));
  const goalIds = tx.select({ id: t.goals.id }).from(t.goals).where(eq(t.goals.spaceId, spaceId));
  await tx.delete(t.goalLinks).where(and(eq(t.goalLinks.personId, personId), inArray(t.goalLinks.goalId, goalIds)));
  const eventIds = tx.select({ id: t.events.id }).from(t.events).where(eq(t.events.spaceId, spaceId));
  await tx.delete(t.eventPeople).where(and(eq(t.eventPeople.personId, personId), inArray(t.eventPeople.eventId, eventIds)));
  await tx.delete(t.personSpaces).where(and(eq(t.personSpaces.personId, personId), eq(t.personSpaces.spaceId, spaceId)));
  // The overall last touch may have come from that Space.
  await tx.execute(sql`update people set last_touched_on = (select max(occurred_on) from interactions where person_id = ${personId}) where id = ${personId}`);
  return { ok: true, data: null };
}

/** Archive hides a person from lists and reminders in every Space; nothing is deleted. */
export async function setPersonArchived(tx: Tx, personId: string, archived: boolean) {
  await tx
    .update(t.personSpaces)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(t.personSpaces.personId, personId));
}

/** Soft delete: gone from the app now, restorable for 30 days, then purged. */
export async function deletePerson(tx: Tx, personId: string) {
  const r = await tx.update(t.people).set({ deletedAt: new Date() }).where(and(eq(t.people.id, personId), isNull(t.people.deletedAt))).returning({ id: t.people.id });
  return r.length > 0;
}

export async function restorePerson(tx: Tx, personId: string) {
  const r = await tx.update(t.people).set({ deletedAt: null }).where(eq(t.people.id, personId)).returning({ id: t.people.id });
  return r.length > 0;
}

/* ======================================================================= touches and promises */

async function assertMember(tx: Tx, personId: string, spaceId: string) {
  const [m] = await tx
    .select({ id: t.personSpaces.id })
    .from(t.personSpaces)
    .innerJoin(t.people, eq(t.people.id, t.personSpaces.personId))
    .where(and(eq(t.personSpaces.personId, personId), eq(t.personSpaces.spaceId, spaceId), isNull(t.people.deletedAt)));
  return Boolean(m);
}

/** Idempotent on the touch id (and the promise id), so offline replays are safe. */
export async function logTouch(tx: Tx, userId: string, raw: TouchInput): Promise<Result<{ id: string }>> {
  const parsed = touchSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details.", String(parsed.error.issues[0]?.path.at(-1) ?? ""));
  const d = parsed.data;
  if (!(await assertMember(tx, d.personId, d.spaceId))) return fail("They're not in that Space.", "spaceId");
  await tx
    .insert(t.interactions)
    .values({ id: d.id, userId, personId: d.personId, spaceId: d.spaceId, occurredOn: d.occurredOn, type: d.type, summary: d.summary, source: "manual" })
    .onConflictDoNothing({ target: t.interactions.id });
  if (d.promise) {
    await tx
      .insert(t.commitments)
      .values({ id: d.promise.id, userId, personId: d.personId, spaceId: d.spaceId, text: d.promise.text, owner: d.promise.owner, dueOn: d.promise.dueOn, interactionId: d.id })
      .onConflictDoNothing({ target: t.commitments.id });
  }
  // Logging a touch counts as sorting them: they're clearly someone you keep up with.
  await tx
    .update(t.personSpaces)
    .set({ triageState: "done" })
    .where(and(eq(t.personSpaces.personId, d.personId), eq(t.personSpaces.spaceId, d.spaceId), ne(t.personSpaces.triageState, "done")));
  return { ok: true, data: { id: d.id } };
}

export async function deleteTouch(tx: Tx, id: string) {
  await tx.delete(t.interactions).where(eq(t.interactions.id, id));
}

export async function addPromise(tx: Tx, userId: string, raw: PromiseInput): Promise<Result<{ id: string }>> {
  const parsed = promiseSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details.", String(parsed.error.issues[0]?.path.at(-1) ?? ""));
  const d = parsed.data;
  if (!(await assertMember(tx, d.personId, d.spaceId))) return fail("They're not in that Space.", "spaceId");
  await tx.insert(t.commitments).values({ userId, ...d }).onConflictDoNothing({ target: t.commitments.id });
  return { ok: true, data: { id: d.id } };
}

export async function setPromiseDone(tx: Tx, id: string, done: boolean) {
  await tx.update(t.commitments).set({ doneAt: done ? new Date() : null }).where(eq(t.commitments.id, id));
}

export async function deletePromise(tx: Tx, id: string) {
  await tx.delete(t.commitments).where(eq(t.commitments.id, id));
}

/* ======================================================================= circles */

export async function listCircles(tx: Tx, spaceId?: string) {
  return tx
    .select({ id: t.circles.id, spaceId: t.circles.spaceId, name: t.circles.name, defaultCadenceDays: t.circles.defaultCadenceDays, position: t.circles.position })
    .from(t.circles)
    .where(spaceId ? eq(t.circles.spaceId, spaceId) : undefined)
    .orderBy(asc(t.circles.position), asc(t.circles.name));
}

export async function saveCircle(tx: Tx, userId: string, input: { id?: string; spaceId: string; name: string; defaultCadenceDays: number | null }): Promise<Result<null>> {
  const name = input.name.trim();
  if (!name) return fail("Give the circle a name.", "name");
  if (name.length > 40) return fail("Keep the name under 40 characters.", "name");
  const siblings = await listCircles(tx, input.spaceId);
  if (siblings.some((c) => c.id !== input.id && c.name.toLowerCase() === name.toLowerCase())) return fail("There's already a circle with that name here.", "name");
  if (input.id) {
    await tx.update(t.circles).set({ name, defaultCadenceDays: input.defaultCadenceDays }).where(eq(t.circles.id, input.id));
  } else {
    await tx.insert(t.circles).values({ userId, spaceId: input.spaceId, name, defaultCadenceDays: input.defaultCadenceDays, position: siblings.length });
  }
  return { ok: true, data: null };
}

/** People in the circle keep their own settings and fall back to the Space default. */
export async function deleteCircle(tx: Tx, id: string) {
  await tx.delete(t.circles).where(eq(t.circles.id, id));
}

/** Tags in use, for filter menus. */
export async function listTags(tx: Tx, spaceId: string | null) {
  const rows = await tx.execute<{ tag: string; n: number }>(sql`
    select tag, count(*)::int as n from person_spaces ps, unnest(ps.tags) as tag
     where ps.archived_at is null ${spaceId ? sql`and ps.space_id = ${spaceId}` : sql``}
     group by tag order by n desc, tag asc limit 50`);
  return [...rows];
}
