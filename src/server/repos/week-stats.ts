import { and, count, countDistinct, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { IsoDate } from "@/domain/dates";
import * as t from "../db/schema";
import type { Tx } from "../db/with-user";

export type WeekStats = { talkedTo: number; promisesKept: number; promisesOpen: number };

/**
 * This week so far (Monday to today, in your time zone), across every Space: how many people you
 * were in touch with, promises you kept, and promises you still owe.
 */
export async function weekStats(tx: Tx, c: { start: IsoDate; today: IsoDate; tz: string }): Promise<WeekStats> {
  const [[talked], [kept], [open]] = await Promise.all([
    tx
      .select({ n: countDistinct(t.interactions.personId) })
      .from(t.interactions)
      .innerJoin(t.people, eq(t.people.id, t.interactions.personId))
      .where(and(isNull(t.people.deletedAt), gte(t.interactions.occurredOn, c.start), lte(t.interactions.occurredOn, c.today))),
    tx
      .select({ n: count() })
      .from(t.commitments)
      .where(and(eq(t.commitments.owner, "me"), sql`(${t.commitments.doneAt} at time zone ${c.tz})::date between ${c.start}::date and ${c.today}::date`)),
    tx
      .select({ n: count() })
      .from(t.commitments)
      .innerJoin(t.people, eq(t.people.id, t.commitments.personId))
      .where(and(eq(t.commitments.owner, "me"), isNull(t.commitments.doneAt), isNull(t.people.deletedAt))),
  ]);
  return { talkedTo: talked?.n ?? 0, promisesKept: kept?.n ?? 0, promisesOpen: open?.n ?? 0 };
}
