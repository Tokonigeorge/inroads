import "server-only";
import { after } from "next/server";
import { runConnectionSync } from "@/server/sync/run-sync";
import { jobsStore } from "@/server/system/jobs";
import { checkLimit } from "@/server/ai/limits";
import { aiJobFeature, runAiJob, type AiJob } from "./ai-jobs";
import { AI_EVENT, inngest, SYNC_EVENT, type AiEventData, type SyncEventData } from "./inngest";

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
  const jobId = await jobsStore().create(userId, `ai:${job.kind}`, "Queued");
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
