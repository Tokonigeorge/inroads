import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { IsoDate } from "@/domain/dates";
import { STRENGTH_WINDOW_DAYS } from "@/domain/relationship";

/**
 * Relationship strength in SQL, for sorting: the same sum as `strength()` in domain/relationship
 * (recency fading over ~75 days, plus touches in the last 180 days, six counting as often).
 */
export const strengthSql = (lastTouched: SQL, personId: SQL, today: IsoDate) => sql`round(
  55 * exp(-greatest(0, ${today}::date - ${lastTouched}) / 75.0)
  + 45 * least(1, (select count(*) from interactions i where i.person_id = ${personId} and i.occurred_on >= ${today}::date - ${STRENGTH_WINDOW_DAYS}::int) / 6.0)
)::int`;
