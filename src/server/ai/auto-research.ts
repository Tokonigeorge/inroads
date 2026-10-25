import "server-only";
import { eq, inArray } from "drizzle-orm";
import { spaceDefaultsSchema } from "@/contracts/spaces";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { addDays } from "@/domain/dates";
import { aiJobFeature, jobKindFor, runAiJob, type AiJob } from "@/server/jobs/ai-jobs";
import { enqueueAiJob } from "@/server/jobs/enqueue";
import { AI_EVENT, inngest, type AiEventData } from "@/server/jobs/inngest";
import { upcomingAttendees } from "@/server/repos/nudges";
import { jobsStore } from "@/server/system/jobs";
import { userContext } from "@/server/user-context";
import { isAiConfigured } from "./config";
import { AiLimitError, checkLimit } from "./limits";

/**
 * Someone you just added by hand gets researched without you asking (P3). Findings arrive as
 * suggestions you keep or dismiss, so nothing is saved silently. Skipped when AI isn't set up,
 * research is off in the Space, or you're at a limit (the button on their page still works).
 * Never throws: adding the person has already succeeded.
 */
export async function autoResearch(userId: string, personId: string, spaceId: string): Promise<string | null> {
  if (!isAiConfigured()) return null;
  try {
    const [space] = await db.withUser(userId, (tx) => tx.select({ kind: t.spaces.kind, defaults: t.spaces.defaults }).from(t.spaces).where(eq(t.spaces.id, spaceId)));
    if (!space) return null;
    const mode = spaceDefaultsSchema.safeParse(space.defaults).data?.researchMode ?? "off";
    if (mode === "off" || (mode === "full" && space.kind !== "work")) return null;
    return await enqueueAiJob(userId, { kind: "research", personId, spaceId, mode: "research" });
  } catch (e) {
    if (!(e instanceof AiLimitError)) console.error("auto research didn't start", e);
    return null;
  }
}

/**
 * A room you added by hand (not a calendar meeting) gets its plan prepared without asking:
 * who'll be there, who matters for your goals, openings. Same rules as `autoResearch`.
 */
export async function autoPrepRoom(userId: string, room: { id: string; spaceId: string; title: string; kind: string }): Promise<string | null> {
  if (!isAiConfigured() || room.kind === "meeting" || room.title.trim().length < 3) return null;
  try {
    return await enqueueAiJob(userId, { kind: "lookup", spaceId: room.spaceId, type: "event", q: room.title.trim().slice(0, 200), eventId: room.id });
  } catch (e) {
    if (!(e instanceof AiLimitError)) console.error("room prep didn't start", e);
    return null;
  }
}

/**
 * Starts an AI job from background work (a sync, a scheduled step), where `after()` isn't
 * available: sent to Inngest when it's set up, otherwise run here and awaited. Null when a
 * limit is reached.
 */
async function startInBackground(userId: string, job: AiJob): Promise<string | null> {
  try {
    await checkLimit(userId, aiJobFeature[job.kind]);
  } catch (e) {
    if (e instanceof AiLimitError) return null;
    throw e;
  }
  const jobId = await jobsStore().create(userId, jobKindFor(job), "Queued");
  if (process.env.INNGEST_EVENT_KEY) await inngest.send({ name: AI_EVENT, data: { userId, jobId, job } satisfies AiEventData });
  else await runAiJob(userId, jobId, job).catch((e) => console.error("background AI job failed", e));
  return jobId;
}

/**
 * Event rooms that arrived from a calendar sync (conferences, mixers, dinners in the next three
 * weeks) get a plan, like rooms you add by hand. At most two per sync; ones with a plan are skipped.
 */
export async function prepareSyncedRooms(userId: string, spaceId: string, rooms: { id: string; title: string; kind: string; startsOn: string }[], today: string) {
  if (!isAiConfigured() || !rooms.length) return 0;
  const soon = rooms.filter((r) => r.kind !== "meeting" && r.startsOn >= today && r.startsOn <= addDays(today, 21));
  if (!soon.length) return 0;
  const planned = new Set(
    (
      await db.withUser(userId, (tx) =>
        tx
          .selectDistinct({ id: t.searches.eventId })
          .from(t.searches)
          .where(
            inArray(
              t.searches.eventId,
              soon.map((r) => r.id),
            ),
          ),
      )
    ).map((r) => r.id),
  );
  let started = 0;
  for (const r of soon.filter((x) => !planned.has(x.id)).slice(0, 2)) {
    const jobId = await startInBackground(userId, { kind: "lookup", spaceId, type: "event", q: r.title.slice(0, 200), eventId: r.id });
    if (!jobId) break;
    started++;
  }
  return started;
}

/**
 * People you're meeting in the next two days who haven't been researched in that Space get
 * researched at your brief time (P3), so the agenda has talking points. At most three a day.
 */
export async function researchUpcomingAttendees(userId: string) {
  if (!isAiConfigured()) return 0;
  const todo = await db.withUser(userId, async (tx) => {
    const ctx = await userContext(tx);
    const spaces = await tx.select({ id: t.spaces.id, kind: t.spaces.kind, defaults: t.spaces.defaults }).from(t.spaces);
    const mode = new Map(spaces.map((sp) => [sp.id, { kind: sp.kind, mode: spaceDefaultsSchema.safeParse(sp.defaults).data?.researchMode ?? "off" }]));
    const people = await upcomingAttendees(tx, { spaceId: null, today: ctx.today, tz: ctx.timezone }, 2);
    return people.filter((p) => {
      const m = mode.get(p.spaceId);
      return !p.researched && m && m.mode !== "off" && !(m.mode === "full" && m.kind !== "work");
    });
  });
  let started = 0;
  for (const p of todo.slice(0, 3)) {
    const jobId = await startInBackground(userId, { kind: "research", personId: p.id, spaceId: p.spaceId, mode: "research" });
    if (!jobId) break;
    started++;
  }
  return started;
}
