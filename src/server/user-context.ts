import "server-only";
import { todayIn, type IsoDate } from "@/domain/dates";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";

/** The user's own "today" (their profile time zone) and phone region. */
export async function userContext(tx: Tx): Promise<{ today: IsoDate; timezone: string; region: string }> {
  const [p] = await tx.select({ tz: t.profiles.timezone, region: t.profiles.defaultRegion }).from(t.profiles);
  const timezone = p?.tz ?? "Africa/Lagos";
  return { today: todayIn(timezone), timezone, region: p?.region ?? "NG" };
}
