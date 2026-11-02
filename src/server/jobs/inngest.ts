import "server-only";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { Inngest } from "inngest";
import { getSystemDb } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { runConnectionSync } from "@/server/sync/run-sync";
import { runExport } from "@/server/account/export";
import { aiJobSchema, runAiJob } from "./ai-jobs";
import { briefsDue, radarDue, usersAtBriefTime } from "@/server/system/briefs";
import { researchUpcomingAttendees } from "@/server/ai/auto-research";
import {
  applyRefreshBatch,
  captureRefreshRequests,
  refreshBatchEnded,
  submitRefreshBatch,
  type RefreshItem,
} from "@/server/ai/batch-refresh";
import { connectionsStore } from "@/server/system/connections";
import { jobsStore } from "@/server/system/jobs";
import { sendDueNotifications } from "@/server/system/notify";

export const inngest = new Inngest({ id: "inroads" });

export const SYNC_EVENT = "connection/sync.requested";
export type SyncEventData = { connectionId: string; jobId: string };

/** One account sync. One at a time per connection; retried by Inngest on unexpected errors. */
export const syncConnection = inngest.createFunction(
  {
    id: "sync-connection",
    triggers: [{ event: SYNC_EVENT }],
    concurrency: { key: "event.data.connectionId", limit: 1 },
    retries: 3,
  },
  async ({ event, step }) => {
    const data = event.data as SyncEventData;
    return step.run("sync", () =>
      runConnectionSync(data.connectionId, data.jobId),
    );
  },
);

export const AI_EVENT = "ai/job.requested";
export type AiEventData = { userId: string; jobId: string; job: unknown };

/** One AI job (research, look up, rooms, brief, scoring). At most two at a time per user (TECH_PLAN §5.3). */
export const aiJob = inngest.createFunction(
  {
    id: "ai-job",
    triggers: [{ event: AI_EVENT }],
    concurrency: { key: "event.data.userId", limit: 2 },
    retries: 1,
  },
  async ({ event, step }) => {
    const data = event.data as AiEventData;
    return step.run("run", () =>
      runAiJob(data.userId, data.jobId, aiJobSchema.parse(data.job)),
    );
  },
);

export const EXPORT_EVENT = "account/export.requested";
export type ExportEventData = { userId: string; jobId: string };

/** A data export (Settings → Data). One at a time per user. */
export const exportData = inngest.createFunction(
  {
    id: "export-data",
    triggers: [{ event: EXPORT_EVENT }],
    concurrency: { key: "event.data.userId", limit: 1 },
    retries: 1,
  },
  async ({ event, step }) => {
    const data = event.data as ExportEventData;
    return step.run("export", () => runExport(data.userId, data.jobId));
  },
);

/** Keeps connected accounts fresh: Google/Outlook every 30 minutes, calendar links hourly. */
export const scheduleSyncs = inngest.createFunction(
  { id: "schedule-syncs", triggers: [{ cron: "*/30 * * * *" }] },
  async ({ step }) => {
    const due = await step.run("find-due", async () => {
      const store = connectionsStore();
      return [
        ...(await store.due(["google", "microsoft"], 25)),
        ...(await store.due(["apple_ics"], 55)),
      ];
    });
    if (!due.length) return { scheduled: 0 };
    // One step makes every job row, one sends them all: 3 steps a run, not 2 per account.
    const jobs = await step.run("create-jobs", async () => {
      const store = jobsStore();
      const out: SyncEventData[] = [];
      for (const c of due)
        out.push({
          connectionId: c.id,
          jobId: await store.create(c.userId, `sync:${c.provider}`),
        });
      return out;
    });
    await step.sendEvent(
      "send-syncs",
      jobs.map((data) => ({ name: SYNC_EVENT, data })),
    );
    return { scheduled: due.length };
  },
);

/** At each user's brief time (Settings → Profile): daily briefs where they read them, and the weekly search for rooms. */
export const prepareBriefs = inngest.createFunction(
  { id: "prepare-briefs", triggers: [{ cron: "*/30 * * * *" }] },
  async ({ step }) => {
    const due = await step.run("find-due", () => briefsDue());
    // Once a week, at the same time, look for rooms that serve each Space's goals (shown on Today).
    const radar = await step.run("find-radar-due", () => radarDue());
    // All the brief and radar jobs made in one step and sent in one batch.
    const ai = await step.run("create-ai-jobs", async () => {
      const store = jobsStore();
      const out: AiEventData[] = [];
      for (const b of due) {
        const job = {
          kind: "brief",
          spaceId: b.spaceId,
          briefKind: "daily",
        } as const;
        out.push({
          userId: b.userId,
          jobId: await store.create(b.userId, "ai:brief", "Queued"),
          job,
        });
      }
      for (const r of radar) {
        const job = { kind: "radar", spaceId: r.spaceId } as const;
        out.push({
          userId: r.userId,
          jobId: await store.create(r.userId, "ai:radar", "Queued"),
          job,
        });
      }
      return out;
    });
    if (ai.length)
      await step.sendEvent(
        "send-ai-jobs",
        ai.map((data) => ({ name: AI_EVENT, data })),
      );
    // Research the people you're meeting in the next two days, so Today has talking points.
    const users = await step.run("find-prep-users", () => usersAtBriefTime());
    // And keep priority people's research fresh, so new roles and news show up: built here, sent
    // through the half-price Batches API, saved when it's back (refresh-batch). One step per person.
    const refresh: Parameters<typeof submitRefreshBatch>[0] = [];
    for (const userId of users) {
      const r = await step.run(`prep-${userId}`, async () => ({
        attendees: await researchUpcomingAttendees(userId),
        refresh: await captureRefreshRequests(userId),
      }));
      refresh.push(...(r.refresh as typeof refresh));
    }
    if (refresh.length) {
      const batch = await step.run("submit-refresh-batch", () =>
        submitRefreshBatch(refresh),
      );
      await step.sendEvent("refresh-batch-submitted", {
        name: REFRESH_BATCH_EVENT,
        data: batch,
      });
    }
    return {
      scheduled: due.length,
      radar: radar.length,
      prepUsers: users.length,
      refreshed: refresh.length,
    };
  },
);

export const REFRESH_BATCH_EVENT = "ai/refresh-batch.submitted";

/** Waits for a refresh batch (checks every 30 minutes, up to a day), then saves each answer as research. */
export const refreshBatch = inngest.createFunction(
  { id: "refresh-batch", triggers: [{ event: REFRESH_BATCH_EVENT }] },
  async ({ event, step }) => {
    const { batchId, items } = event.data as {
      batchId: string;
      items: RefreshItem[];
    };
    for (let i = 0; i < 49; i++) {
      if (await step.run(`check-${i}`, () => refreshBatchEnded(batchId))) {
        return step.run("apply", () => applyRefreshBatch(batchId, items));
      }
      await step.sleep(`wait-${i}`, "30m");
    }
    return { saved: 0, failed: items.length, timedOut: true };
  },
);

/** Every 15 minutes: "How did it go?" after meetings end, and wrap-ups at each person's chosen time. */
export const sendNotifications = inngest.createFunction(
  { id: "send-notifications", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    return step.run("send", () => sendDueNotifications());
  },
);

/** Daily clean-up: purge things deleted more than 30 days ago and expired nudge states. */
export const dailyCleanup = inngest.createFunction(
  { id: "daily-cleanup", triggers: [{ cron: "17 3 * * *" }] },
  async ({ step }) => {
    return step.run("purge", async () => {
      const sys = getSystemDb();
      const cutoff = new Date(Date.now() - 30 * 86_400_000);
      const people = await sys
        .delete(t.people)
        .where(
          and(isNotNull(t.people.deletedAt), lt(t.people.deletedAt, cutoff)),
        )
        .returning({ id: t.people.id });
      const events = await sys
        .delete(t.events)
        .where(
          and(isNotNull(t.events.deletedAt), lt(t.events.deletedAt, cutoff)),
        )
        .returning({ id: t.events.id });
      const nudges = await sys
        .delete(t.nudgeStates)
        .where(lt(t.nudgeStates.expiresAt, new Date()))
        .returning({ key: t.nudgeStates.key });
      await sys
        .delete(t.dataExports)
        .where(lt(t.dataExports.expiresAt, new Date()));
      const jobs = await sys
        .delete(t.jobs)
        .where(lt(t.jobs.createdAt, new Date(Date.now() - 14 * 86_400_000)))
        .returning({ id: t.jobs.id });
      // Shares you never added or discarded: delete them, text and all.
      await sys
        .delete(t.imports)
        .where(
          and(
            eq(t.imports.type, "share"),
            lt(t.imports.createdAt, new Date(Date.now() - 2 * 86_400_000)),
          ),
        );
      // File imports left in review for two days: drop the staged rows (the files were never kept).
      const stale = await sys
        .update(t.imports)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(t.imports.status, "review"),
            lt(t.imports.createdAt, new Date(Date.now() - 2 * 86_400_000)),
          ),
        )
        .returning({ id: t.imports.id });
      if (stale.length)
        await sys.delete(t.importItems).where(
          inArray(
            t.importItems.importId,
            stale.map((s) => s.id),
          ),
        );
      // Sync records that brought nothing in (most scheduled runs did, before they were skipped): a day
      // old, nothing points at them, so Import history only shows syncs that changed something.
      const emptySyncs = await sys.execute(sql`
      delete from imports i
       where i.id in (
         select i2.id from imports i2
          where i2.type in ('google', 'microsoft', 'apple_ics') and i2.status = 'done' and i2.created_at < now() - interval '1 day'
            and not exists (select 1 from people p where p.import_id = i2.id)
            and not exists (select 1 from interactions x where x.import_id = i2.id)
            and not exists (select 1 from events e where e.import_id = i2.id)
          limit 5000)`);
      // The sent-notifications log only has to remember a couple of weeks (wrap-ups look back at most 7 days).
      await sys
        .delete(t.notificationLog)
        .where(
          lt(
            t.notificationLog.createdAt,
            new Date(Date.now() - 30 * 86_400_000),
          ),
        );
      return {
        people: people.length,
        events: events.length,
        nudges: nudges.length,
        jobs: jobs.length,
        staleImports: stale.length,
        emptySyncs: emptySyncs.count ?? 0,
      };
    });
  },
);

export const functions = [
  syncConnection,
  scheduleSyncs,
  dailyCleanup,
  aiJob,
  prepareBriefs,
  exportData,
  sendNotifications,
];
