import "server-only";
import { after } from "next/server";
import { runConnectionSync } from "@/server/sync/run-sync";
import { jobsStore } from "@/server/system/jobs";
import { checkLimit } from "@/server/ai/limits";
import { aiJobFeature, jobKindFor, runAiJob, type AiJob } from "./ai-jobs";
import { runExport } from "@/server/account/export";
import { AI_EVENT, EXPORT_EVENT, inngest, SYNC_EVENT, type AiEventData, type ExportEventData, type SyncEventData } from "./inngest";

/**
 * Starts a sync and returns the job id the UI follows. With Inngest configured the work runs as
 * a durable background job; without it (local development, tests) it runs right after the
 * response is sent, so the app still works end to end.
 */
export async function enqueueSync(userId: string, connectionId: string, provider: string): Promise<string> {
  const jobId = await jobsStore().create(userId, `sync:${provider}`);
  const data: SyncEventData = { connectionId, jobId };
  if (process.env.INNGEST_EVENT_KEY) {
    await inngest.send({ name: SYNC_EVENT, data });
  } else {
    after(async () => {
      try {
        await runConnectionSync(connectionId, jobId);
      } catch (e) {
        console.error("sync failed", e);
      }
    });
  }
  return jobId;
}

/**
 * Starts an AI job and returns its id. The limit is checked first, so a user over their
 * allowance gets the message straight away instead of a failed job.
 */
export async function enqueueAiJob(userId: string, job: AiJob): Promise<string> {
  await checkLimit(userId, aiJobFeature[job.kind]);
  const jobId = await jobsStore().create(userId, jobKindFor(job), "Queued");
  if (process.env.INNGEST_EVENT_KEY) {
    await inngest.send({ name: AI_EVENT, data: { userId, jobId, job } satisfies AiEventData });
  } else {
    after(async () => {
      try {
        await runAiJob(userId, jobId, job);
      } catch (e) {
        console.error("ai job failed", e);
      }
    });
  }
  return jobId;
}

/** Starts a data export and returns the job id the Settings page follows. */
export async function enqueueExport(userId: string): Promise<string> {
  const jobId = await jobsStore().create(userId, "export", "Queued");
  if (process.env.INNGEST_EVENT_KEY) {
    await inngest.send({ name: EXPORT_EVENT, data: { userId, jobId } satisfies ExportEventData });
  } else {
    after(async () => {
      try {
        await runExport(userId, jobId);
      } catch (e) {
        console.error("export failed", e);
      }
    });
  }
  return jobId;
}
