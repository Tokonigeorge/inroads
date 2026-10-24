import "server-only";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { Inngest } from "inngest";
import { getSystemDb } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { runConnectionSync } from "@/server/sync/run-sync";
import { connectionsStore } from "@/server/system/connections";
import { jobsStore } from "@/server/system/jobs";

export const inngest = new Inngest({ id: "inroads" });

export const SYNC_EVENT = "connection/sync.requested";
export type SyncEventData = { connectionId: string; jobId: string };

/** One account sync. One at a time per connection; retried by Inngest on unexpected errors. */
export const syncConnection = inngest.createFunction(
  { id: "sync-connection", triggers: [{ event: SYNC_EVENT }], concurrency: { key: "event.data.connectionId", limit: 1 }, retries: 3 },
  async ({ event, step }) => {
    const data = event.data as SyncEventData;
    return step.run("sync", () => runConnectionSync(data.connectionId, data.jobId));
  },
);

/** Keeps connected accounts fresh: Google/Outlook every 30 minutes, calendar links hourly. */
export const scheduleSyncs = inngest.createFunction({ id: "schedule-syncs", triggers: [{ cron: "*/30 * * * *" }] }, async ({ step }) => {
  const due = await step.run("find-due", async () => {
    const store = connectionsStore();
    return [...(await store.due(["google", "microsoft"], 25)), ...(await store.due(["apple_ics"], 55))];
  });
  for (const c of due) {
    const jobId = await step.run(`job-${c.id}`, () => jobsStore().create(c.userId, `sync:${c.provider}`));
    await step.sendEvent(`send-${c.id}`, { name: SYNC_EVENT, data: { connectionId: c.id, jobId } satisfies SyncEventData });
  }
  return { scheduled: due.length };
});

/** Daily clean-up: purge things deleted more than 30 days ago and expired nudge states. */
export const dailyCleanup = inngest.createFunction({ id: "daily-cleanup", triggers: [{ cron: "17 3 * * *" }] }, async ({ step }) => {
  return step.run("purge", async () => {
    const sys = getSystemDb();
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    const people = await sys.delete(t.people).where(and(isNotNull(t.people.deletedAt), lt(t.people.deletedAt, cutoff))).returning({ id: t.people.id });
    const events = await sys.delete(t.events).where(and(isNotNull(t.events.deletedAt), lt(t.events.deletedAt, cutoff))).returning({ id: t.events.id });
    const nudges = await sys.delete(t.nudgeStates).where(lt(t.nudgeStates.expiresAt, new Date())).returning({ key: t.nudgeStates.key });
    const jobs = await sys.delete(t.jobs).where(lt(t.jobs.createdAt, new Date(Date.now() - 14 * 86_400_000))).returning({ id: t.jobs.id });
    // File imports left in review for two days: drop the staged rows (the files were never kept).
    const stale = await sys
      .update(t.imports)
      .set({ status: "cancelled" })
      .where(and(eq(t.imports.status, "review"), lt(t.imports.createdAt, new Date(Date.now() - 2 * 86_400_000))))
      .returning({ id: t.imports.id });
    if (stale.length) await sys.delete(t.importItems).where(inArray(t.importItems.importId, stale.map((s) => s.id)));
    return { people: people.length, events: events.length, nudges: nudges.length, jobs: jobs.length, staleImports: stale.length };
  });
});

export const functions = [syncConnection, scheduleSyncs, dailyCleanup];
