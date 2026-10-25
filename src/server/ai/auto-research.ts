import "server-only";
import { eq } from "drizzle-orm";
import { spaceDefaultsSchema } from "@/contracts/spaces";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { enqueueAiJob } from "@/server/jobs/enqueue";
import { isAiConfigured } from "./config";
import { AiLimitError } from "./limits";

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
