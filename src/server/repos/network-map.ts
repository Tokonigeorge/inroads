import "server-only";
import { sql } from "drizzle-orm";
import type { IsoDate } from "@/domain/dates";
import type { MapGoal, MapPerson } from "@/domain/network-map";
import type { Tx } from "@/server/db/with-user";
import { strengthSql } from "./strength";

/** How many people the map draws: starred first, then the strongest. Past this a map is just noise. */
export const MAP_LIMIT = 150;

/**
 * The network map's people in one Space (or all of them): strength, starred, and the
 * highest-priority active goal they're on. Goals are the active ones in the same Space(s).
 */
export async function loadNetworkMap(tx: Tx, spaceId: string | null, today: IsoDate, limit = MAP_LIMIT): Promise<{ people: (MapPerson & { company: string | null; linked: boolean })[]; goals: MapGoal[]; total: number }> {
  const inSpace = spaceId ? sql`and ps.space_id = ${spaceId}` : sql``;
  const goalsInSpace = spaceId ? sql`and g.space_id = ${spaceId}` : sql``;
  const rows = await tx.execute<{ id: string; name: string; company: string | null; starred: boolean; strength: number | null; goal_id: string | null; linked: boolean; total: number }>(sql`
    with members as (
      select p.id, p.name, p.company, p.last_touched_on, bool_or(ps.starred) as starred
      from people p
      join person_spaces ps on ps.person_id = p.id and ps.archived_at is null ${inSpace}
      where p.deleted_at is null
      group by p.id
    )
    select * from (
    select m.id, m.name, m.company, m.starred,
      exists (select 1 from event_people ep where ep.person_id = m.id)
        or exists (select 1 from person_links pl where pl.from_person_id = m.id or pl.to_person_id = m.id) as linked,
      case when m.last_touched_on is null then null else ${strengthSql(sql`m.last_touched_on`, sql`m.id`, today)} end as strength,
      (select gl.goal_id from goal_links gl join goals g on g.id = gl.goal_id
        where gl.person_id = m.id and g.active and g.archived_at is null ${goalsInSpace}
        order by g.priority, g.created_at limit 1) as goal_id,
      count(*) over ()::int as total
    from members m
    ) x
    -- People you know or are working toward first: starred, then anyone with a touch or on a goal.
    order by x.starred desc, (x.strength is not null or x.goal_id is not null) desc, x.strength desc nulls last, x.name
    limit ${limit}
  `);
  const goals = await tx.execute<{ id: string; text: string }>(sql`
    select g.id, g.text from goals g where g.active and g.archived_at is null ${goalsInSpace} order by g.priority, g.created_at
  `);
  return {
    people: [...rows].map((r) => ({ id: r.id, name: r.name, company: r.company, starred: r.starred, strength: r.strength == null ? null : Number(r.strength), goalId: r.goal_id, linked: r.linked })),
    goals: [...goals].map((g) => ({ id: g.id, text: g.text })),
    total: rows[0]?.total ?? 0,
  };
}

export type MapLink = { a: string; b: string; why: "knows" | "company" | "event" };

/**
 * How the people on the map connect to each other: links you saved ("knows", "introduced by"),
 * the same company, and events you linked them both to. At most 600, strongest kinds first.
 */
export async function loadMapLinks(tx: Tx, ids: string[]): Promise<MapLink[]> {
  if (ids.length < 2) return [];
  const list = sql`${`{${ids.join(",")}}`}::uuid[]`;
  const rows = await tx.execute<{ a: string; b: string; why: MapLink["why"] }>(sql`
    with ids as (select unnest(${list}) as id),
    links as (
      select distinct least(l.from_person_id, l.to_person_id) as a, greatest(l.from_person_id, l.to_person_id) as b, 'knows' as why, 0 as rank
        from person_links l
       where l.from_person_id in (select id from ids) and l.to_person_id in (select id from ids)
      union
      select p1.id, p2.id, 'company', 1
        from people p1 join people p2 on p1.id < p2.id and lower(trim(p1.company)) = lower(trim(p2.company))
       where p1.id in (select id from ids) and p2.id in (select id from ids) and coalesce(trim(p1.company), '') <> ''
      union
      select distinct least(x.person_id, y.person_id), greatest(x.person_id, y.person_id), 'event', 2
        from event_people x join event_people y on x.event_id = y.event_id and x.person_id < y.person_id
       where x.person_id in (select id from ids) and y.person_id in (select id from ids)
    )
    select distinct on (a, b) a, b, why from links order by a, b, rank limit 600
  `);
  return [...rows];
}
