import "server-only";
import { sql } from "drizzle-orm";
import { getSystemDb } from "@/server/db/client";
import type { Database } from "@/server/db/with-user";

/**
 * Daily briefs to prepare now: Spaces where the user wrote a daily brief in the last week,
 * whose brief time (in their own zone) fell in the last 30 minutes, with nothing written for
 * today yet. Limited to people who use briefs so the scheduled run doesn't spend AI on everyone.
 */
export async function briefsDue(sys: Database = getSystemDb(), now: Date = new Date()) {
  const at = now.toISOString();
  const rows = await sys.execute<{ user_id: string; space_id: string }>(sql`
    select b.user_id, b.space_id
    from (select distinct user_id, space_id from briefs where kind = 'daily' and created_at > ${at}::timestamptz - interval '7 days') b
    join profiles p on p.user_id = b.user_id
    join spaces s on s.id = b.space_id and s.archived_at is null
    where mod((extract(epoch from ((${at}::timestamptz at time zone p.timezone)::time - p.brief_time))::int / 60) + 1440, 1440) < 30
      and not exists (
        select 1 from briefs x
        where x.user_id = b.user_id and x.space_id = b.space_id and x.kind = 'daily'
          and x.period_key = to_char(${at}::timestamptz at time zone p.timezone, 'YYYY-MM-DD')
      )
    limit 500`);
  return [...rows].map((r) => ({ userId: r.user_id, spaceId: r.space_id }));
}

/**
 * Spaces due their weekly search for rooms (P3): they have an active goal, nobody searched in the
 * last 7 days, the owner has signed in within 30 days, and it's their brief time. Limits still
 * apply when the job runs.
 */
export async function radarDue(sys: Database = getSystemDb(), now: Date = new Date()) {
  const at = now.toISOString();
  const rows = await sys.execute<{ user_id: string; space_id: string }>(sql`
    select distinct g.user_id, g.space_id
    from goals g
    join spaces s on s.id = g.space_id and s.archived_at is null
    join profiles p on p.user_id = g.user_id
    join auth.users u on u.id = g.user_id
    where g.active and g.archived_at is null and not g.example
      and u.last_sign_in_at > ${at}::timestamptz - interval '30 days'
      and mod((extract(epoch from ((${at}::timestamptz at time zone p.timezone)::time - p.brief_time))::int / 60) + 1440, 1440) < 30
      and not exists (
        select 1 from searches r
        where r.space_id = g.space_id and r.type = 'radar' and r.created_at > ${at}::timestamptz - interval '7 days'
      )
    limit 200`);
  return [...rows].map((r) => ({ userId: r.user_id, spaceId: r.space_id }));
}

/** People whose brief time is now and who signed in within 30 days (for daily background prep). */
export async function usersAtBriefTime(sys: Database = getSystemDb(), now: Date = new Date()) {
  const at = now.toISOString();
  const rows = await sys.execute<{ user_id: string }>(sql`
    select p.user_id
    from profiles p
    join auth.users u on u.id = p.user_id
    where u.last_sign_in_at > ${at}::timestamptz - interval '30 days'
      and mod((extract(epoch from ((${at}::timestamptz at time zone p.timezone)::time - p.brief_time))::int / 60) + 1440, 1440) < 30
    limit 500`);
  return [...rows].map((r) => r.user_id);
}
