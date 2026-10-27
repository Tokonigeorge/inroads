import "server-only";
import { z } from "zod";
import { lookupTypes } from "@/server/ai/prompts/lookup";
import { AiError } from "@/server/ai/run";
import { AiLimitError } from "@/server/ai/limits";
import { lookUp, researchPerson, scorePeople, suggestRooms, writeBrief, type FeatureDeps } from "@/server/ai/features";
import { jobsStore } from "@/server/system/jobs";

const uuid = z.string().uuid();
export const aiJobSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("research"), personId: uuid, spaceId: uuid, mode: z.enum(["research", "verify"]), pasted: z.string().max(12000).optional() }),
  z.object({ kind: z.literal("lookup"), spaceId: uuid, type: z.enum(lookupTypes), q: z.string().trim().min(2).max(200), context: z.string().max(12000).optional(), personId: uuid.optional(), eventId: uuid.optional() }),
  z.object({ kind: z.literal("radar"), spaceId: uuid }),
  z.object({ kind: z.literal("brief"), spaceId: uuid, briefKind: z.enum(["daily", "weekly"]) }),
  z.object({ kind: z.literal("score"), spaceId: uuid }),
]);
export type AiJob = z.infer<typeof aiJobSchema>;

export const researchJobKind = (personId: string) => `ai:research:${personId}`;
export const prepJobKind = (eventId: string) => `ai:prep:${eventId}`;

/** The `jobs.kind` for a job: research and room prep name what they're about, so its page can show them running. */
export function jobKindFor(job: AiJob) {
  if (job.kind === "research") return researchJobKind(job.personId);
  if (job.kind === "lookup" && job.eventId) return prepJobKind(job.eventId);
  return `ai:${job.kind}`;
}

export const aiJobFeature = { research: "research", lookup: "lookup", radar: "radar", brief: "brief", score: "score" } as const;

const startStep: Record<AiJob["kind"], string> = {
  research: "Starting research",
  lookup: "Starting to look it up",
  radar: "Looking for rooms",
  brief: "Writing your brief",
  score: "Scoring people against your goals",
};

/** Runs one AI job and records progress and the outcome on its `jobs` row. */
export async function runAiJob(userId: string, jobId: string, job: AiJob, deps: FeatureDeps = {}) {
  const jobs = jobsStore(deps.sys);
  const progress = (step: string) => void jobs.progress(jobId, { step }).catch(() => undefined);
  try {
    await jobs.progress(jobId, { step: startStep[job.kind] });
    const result =
      job.kind === "research"
        ? await researchPerson(deps, userId, { personId: job.personId, spaceId: job.spaceId, mode: job.mode, pasted: job.pasted, jobId }, progress)
        : job.kind === "lookup"
          ? await lookUp(deps, userId, job, progress)
          : job.kind === "radar"
            ? await suggestRooms(deps, userId, job, progress)
            : job.kind === "brief"
              ? await writeBrief(deps, userId, { spaceId: job.spaceId, kind: job.briefKind }, progress)
              : await scorePeople(deps, userId, job, progress);
    await jobs.done(jobId, { step: "Done" }, { kind: job.kind, ...result });
    return result;
  } catch (e) {
    // The person sees a plain sentence; the logs get the real cause.
    console.error(`ai job ${job.kind} failed`, e instanceof AiError ? `(${e.code})` : "", e);
    const message = e instanceof AiError || e instanceof AiLimitError ? e.message : "That didn't finish. Try again in a moment.";
    await jobs.fail(jobId, message);
    if (!(e instanceof AiError) && !(e instanceof AiLimitError)) throw e;
    return null;
  }
}
