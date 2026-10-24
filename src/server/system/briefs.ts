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
