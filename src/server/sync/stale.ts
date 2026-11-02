import "server-only";
import { and, eq, gt, inArray, isNull, like, ne, or } from "drizzle-orm";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { enqueueSync } from "@/server/jobs/enqueue";
import { listConnections } from "@/server/repos/connections";

/**
 * Syncs the user's connected accounts that are more than 10 minutes behind (calendar links: 30),
 * on top of the scheduled sync, so new meetings show up when the app is opened. Skips accounts
 * with a sync already running and ones that need reconnecting.
 */
export async function syncStale(userId: string): Promise<string[]> {
  const now = Date.now();
  const due = await db.withUser(userId, async (tx) => {
    // Opening the app counts as being active (sign-in dates go stale on long sessions).
    const today = new Date().toISOString().slice(0, 10);
    await tx
      .update(t.profiles)
      .set({ lastSeenOn: today })
      .where(and(eq(t.profiles.userId, userId), or(isNull(t.profiles.lastSeenOn), ne(t.profiles.lastSeenOn, today))));
    const stale = (await listConnections(tx)).filter(
      (a) => a.status === "active" && (!a.lastSyncedAt || now - a.lastSyncedAt.getTime() > (a.provider === "apple_ics" ? 30 : 10) * 60_000),
    );
    if (!stale.length) return [];
    const running = await tx
      .select({ kind: t.jobs.kind })
      .from(t.jobs)
      .where(and(inArray(t.jobs.status, ["queued", "running"]), like(t.jobs.kind, "sync:%"), gt(t.jobs.createdAt, new Date(now - 10 * 60_000))));
    const busy = new Set(running.map((r) => r.kind));
    return stale.filter((a) => !busy.has(`sync:${a.provider}`));
  });
  const jobIds: string[] = [];
  for (const a of due) jobIds.push(await enqueueSync(userId, a.id, a.provider));
  return jobIds;
}
