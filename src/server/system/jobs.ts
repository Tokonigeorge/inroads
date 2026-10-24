import "server-only";
import { eq } from "drizzle-orm";
import { getSystemDb } from "@/server/db/client";
import * as t from "@/server/db/schema";
import type { Database } from "@/server/db/with-user";

export type JobProgress = { step: string; done?: number; total?: number; summary?: Record<string, unknown> };

/** Job rows are written by the system and read by their owner (RLS), so progress survives closed tabs. */
export function jobsStore(sys: Database = getSystemDb()) {
  return {
    async create(userId: string, kind: string, step = "Waiting to start") {
      const [row] = await sys.insert(t.jobs).values({ userId, kind, status: "queued", progress: { step } }).returning({ id: t.jobs.id });
      return row.id;
    },
    async progress(id: string, progress: JobProgress) {
      await sys.update(t.jobs).set({ status: "running", progress }).where(eq(t.jobs.id, id));
    },
    async done(id: string, progress: JobProgress, resultRef: Record<string, unknown> = {}) {
      await sys.update(t.jobs).set({ status: "done", progress, resultRef }).where(eq(t.jobs.id, id));
    },
    async fail(id: string, message: string) {
      await sys.update(t.jobs).set({ status: "failed", error: message }).where(eq(t.jobs.id, id));
    },
  };
}
