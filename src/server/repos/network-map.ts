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
export async function loadNetworkMap(tx: Tx, spaceId: string | null, today: IsoDate, limit = MAP_LIMIT): Promise<{ people: MapPerson[]; goals: MapGoal[]; total: number }> {
  const inSpace = spaceId ? sql`and ps.space_id = ${spaceId}` : sql``;
  const goalsInSpace = spaceId ? sql`and g.space_id = ${spaceId}` : sql``;
  const rows = await tx.execute<{ id: string; name: string; starred: boolean; strength: number | null; goal_id: string | null; total: number }>(sql`
    with members as (
      select p.id, p.name, p.last_touched_on, bool_or(ps.starred) as starred
      from people p
      join person_spaces ps on ps.person_id = p.id and ps.archived_at is null ${inSpace}
      where p.deleted_at is null
      group by p.id
    )
    select m.id, m.name, m.starred,
      case when m.last_touched_on is null then null else ${strengthSql(sql`m.last_touched_on`, sql`m.id`, today)} end as strength,
      (select gl.goal_id from goal_links gl join goals g on g.id = gl.goal_id
        where gl.person_id = m.id and g.active and g.archived_at is null ${goalsInSpace}
        order by g.priority, g.created_at limit 1) as goal_id,
      count(*) over ()::int as total
    from members m
    order by m.starred desc, strength desc nulls last, m.name
    limit ${limit}
  `);
  const goals = await tx.execute<{ id: string; text: string }>(sql`
    select g.id, g.text from goals g where g.active and g.archived_at is null ${goalsInSpace} order by g.priority, g.created_at
  `);
  return {
    people: [...rows].map((r) => ({ id: r.id, name: r.name, starred: r.starred, strength: r.strength == null ? null : Number(r.strength), goalId: r.goal_id })),
    goals: [...goals].map((g) => ({ id: g.id, text: g.text })),
    total: rows[0]?.total ?? 0,
  };
}
