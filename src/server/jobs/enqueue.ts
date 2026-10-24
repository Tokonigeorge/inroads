import "server-only";
import { after } from "next/server";
import { runConnectionSync } from "@/server/sync/run-sync";
import { jobsStore } from "@/server/system/jobs";
import { inngest, SYNC_EVENT, type SyncEventData } from "./inngest";

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
