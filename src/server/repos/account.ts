import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { listSpaces } from "./spaces";

export async function getAccountOverview(userId: string) {
  return db.withUser(userId, async (tx) => {
    const [profile] = await tx.select().from(t.profiles).where(eq(t.profiles.userId, userId));
    const spaces = await listSpaces(tx, { includeArchived: true });
    const [counts] = await tx
      .select({
        people: sql<number>`(select count(*)::int from people where deleted_at is null)`,
        events: sql<number>`(select count(*)::int from events where deleted_at is null)`,
        goals: sql<number>`(select count(*)::int from goals where archived_at is null)`,
        examples: sql<number>`(select count(*)::int from people where example)`,
      })
      .from(sql`(select 1) as one`);
    return { profile, spaces, counts };
  });
}
