import "server-only";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { db } from "@/server/db/client";
import { starredDueForRefresh, REFRESH_DAYS } from "./auto-research";
import { getAnthropic, type AnthropicLike } from "./client";
import { isAiConfigured } from "./config";
import { researchPerson, type FeatureDeps } from "./features";
import { AiLimitError } from "./limits";
import { CapturedRequest } from "./run";

/**
 * The monthly refresh of priority people's research through the Message Batches API: half the
 * price, answered within 24 hours (usually within the hour) instead of straight away, which is
 * fine for a refresh nobody is waiting on (DECISIONS #205).
 *
 * 1. At brief time, `captureRefreshRequests` runs the ordinary research code in capture mode:
 *    it checks the limits and builds the exact request, but doesn't send it.
 * 2. `submitRefreshBatch` sends them all as one batch.
 * 3. When the batch has ended, `applyRefreshBatch` runs the same research code again with the
 *    batch's answer as its first reply: resumed web turns, the JSON repair, the dossier and the
 *    suggestions all work as they always do.
 */

export type RefreshItem = {
  customId: string;
  userId: string;
  personId: string;
  spaceId: string;
};
type Captured = Omit<RefreshItem, "customId"> & {
  params: CapturedRequest["params"];
};

/** How many priority people a day each user gets refreshed. */
const REFRESH_PER_DAY = 2;

export async function captureRefreshRequests(
  userId: string,
  deps: FeatureDeps = {},
): Promise<Captured[]> {
  if (!isAiConfigured() && !deps.client) return [];
  const cutoff = new Date(Date.now() - REFRESH_DAYS * 86_400_000);
  const todo = await (deps.db ?? db).withUser(userId, (tx) =>
    starredDueForRefresh(tx, cutoff, REFRESH_PER_DAY),
  );
  const out: Captured[] = [];
  for (const p of todo) {
    try {
      await researchPerson({ ...deps, capture: true }, userId, {
        personId: p.personId,
        spaceId: p.spaceId,
        mode: "research",
      });
    } catch (e) {
      if (e instanceof CapturedRequest)
        out.push({ userId, ...p, params: e.params });
      else if (e instanceof AiLimitError) break;
      else console.error("refresh request couldn't be built", e);
    }
  }
  return out;
}

export async function submitRefreshBatch(
  items: Captured[],
  client: AnthropicLike = getAnthropic(),
) {
  const requests = items.map((it, i) => ({
    custom_id: `r${i}`,
    params: it.params,
  }));
  const batch = await client.beta.messages.batches.create({ requests });
  return {
    batchId: batch.id,
    items: items.map(
      (it, i): RefreshItem => ({
        customId: `r${i}`,
        userId: it.userId,
        personId: it.personId,
        spaceId: it.spaceId,
      }),
    ),
  };
}

export async function refreshBatchEnded(
  batchId: string,
  client: AnthropicLike = getAnthropic(),
) {
  return (
    (await client.beta.messages.batches.retrieve(batchId)).processing_status ===
    "ended"
  );
}

/** Saves each answer as research; ones that errored or expired are simply due again tomorrow. */
export async function applyRefreshBatch(
  batchId: string,
  items: RefreshItem[],
  deps: FeatureDeps = {},
) {
  const client = deps.client ?? getAnthropic();
  const byId = new Map(items.map((it) => [it.customId, it]));
  const counts = { saved: 0, failed: 0 };
  for await (const r of await client.beta.messages.batches.results(batchId)) {
    const it = byId.get(r.custom_id);
    if (!it) continue;
    if (r.result.type !== "succeeded") {
      counts.failed++;
      continue;
    }
    try {
      await researchPerson(
        { ...deps, client, firstMessage: r.result.message as BetaMessage },
        it.userId,
        { personId: it.personId, spaceId: it.spaceId, mode: "research" },
      );
      counts.saved++;
    } catch (e) {
      console.error("refresh answer couldn't be saved", e);
      counts.failed++;
    }
  }
  return counts;
}
