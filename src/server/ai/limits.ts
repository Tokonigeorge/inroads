import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { getSystemDb } from "@/server/db/client";
import * as t from "@/server/db/schema";
import type { Database } from "@/server/db/with-user";
import { aiConfig, aiFeatureLabels, type AiFeature } from "./config";

export class AiLimitError extends Error {
  constructor(
    message: string,
    public resetsAt: Date,
  ) {
    super(message);
  }
}

const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfUtcMonth = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const nextMonth = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

/** Throws a plain-words AiLimitError when a per-feature, per-user or whole-app limit is reached. */
export async function checkLimit(userId: string, feature: AiFeature, sys: Database = getSystemDb()) {
  const cfg = aiConfig();
  const day = startOfUtcDay();
  const month = startOfUtcMonth();
  const [[today], [mine], [app]] = await Promise.all([
    sys
      .select({ n: sql<number>`count(*)::int` })
      .from(t.aiUsage)
      .where(and(eq(t.aiUsage.userId, userId), eq(t.aiUsage.feature, feature), gte(t.aiUsage.createdAt, day))),
    sys
      .select({ micro: sql<number>`coalesce(sum(cost_micro_usd), 0)::bigint` })
      .from(t.aiUsage)
      .where(and(eq(t.aiUsage.userId, userId), gte(t.aiUsage.createdAt, month))),
    sys.select({ micro: sql<number>`coalesce(sum(cost_micro_usd), 0)::bigint` }).from(t.aiUsage).where(gte(t.aiUsage.createdAt, month)),
  ]);
  if (Number(app.micro) >= cfg.appMonthlyUsd * 1_000_000) {
    throw new AiLimitError("AI features are paused for everyone until next month while we keep costs in check.", nextMonth());
  }
  if (cfg.unlimitedEmails.length && (await isUnlimited(userId, cfg.unlimitedEmails, sys))) return;
  if (Number(mine.micro) >= cfg.userMonthlyUsd * 1_000_000) {
    throw new AiLimitError("You've used this month's AI allowance. It resets on the 1st.", nextMonth());
  }
  const cap = cfg.dailyLimits[feature];
  if (today.n >= cap) {
    throw new AiLimitError(`You've used ${aiFeatureLabels[feature].toLowerCase()} ${cap} times today. It resets at midnight UTC.`, new Date(day.getTime() + 86_400_000));
  }
}

/** True for an account listed in AI_UNLIMITED_EMAILS. */
async function isUnlimited(userId: string, emails: string[], sys: Database) {
  const rows = await sys.execute<{ email: string | null }>(sql`select email from auth.users where id = ${userId}`);
  const email = [...rows][0]?.email?.toLowerCase();
  return Boolean(email && emails.includes(email));
}

export async function recordUsage(input: { userId: string; feature: AiFeature; model: string; inputTokens: number; outputTokens: number; webSearches: number; costMicroUsd: number }, sys: Database = getSystemDb()) {
  await sys.insert(t.aiUsage).values(input);
}

/** This month's usage for the meter in Settings. */
export async function usageSummary(userId: string, sys: Database = getSystemDb()) {
  const cfg = aiConfig();
  const day = startOfUtcDay();
  const month = startOfUtcMonth();
  const [byFeature, [spend]] = await Promise.all([
    sys
      .select({ feature: t.aiUsage.feature, n: sql<number>`count(*)::int` })
      .from(t.aiUsage)
      .where(and(eq(t.aiUsage.userId, userId), gte(t.aiUsage.createdAt, day)))
      .groupBy(t.aiUsage.feature),
    sys
      .select({ micro: sql<number>`coalesce(sum(cost_micro_usd), 0)::bigint` })
      .from(t.aiUsage)
      .where(and(eq(t.aiUsage.userId, userId), gte(t.aiUsage.createdAt, month))),
  ]);
  return {
    today: Object.fromEntries(byFeature.map((r) => [r.feature, r.n])) as Partial<Record<AiFeature, number>>,
    limits: cfg.dailyLimits,
    monthUsd: Number(spend.micro) / 1_000_000,
    monthCapUsd: cfg.userMonthlyUsd,
  };
}
