import "server-only";

/**
 * Model tiers and usage limits (TECH_PLAN §5.1, §5.4). Model IDs live here and in env only.
 * fast: drafts, scoring, chat extraction, card reading, quick capture. strong: research, look up, rooms, briefs.
 */
export const aiConfig = () => ({
  models: {
    fast: process.env.AI_MODEL_FAST || "claude-haiku-5-5",
    strong: process.env.AI_MODEL_STRONG || "claude-opus-5-5",
  },
  /** Runs per feature per user per day. */
  dailyLimits: {
    research: Number(process.env.AI_LIMIT_RESEARCH ?? 5),
    lookup: Number(process.env.AI_LIMIT_LOOKUP ?? 5),
    radar: Number(process.env.AI_LIMIT_RADAR ?? 2),
    brief: Number(process.env.AI_LIMIT_BRIEF ?? 4),
    draft: Number(process.env.AI_LIMIT_DRAFT ?? 50),
    card: Number(process.env.AI_LIMIT_CARD ?? 30),
    chat: Number(process.env.AI_LIMIT_CHAT ?? 10),
    score: Number(process.env.AI_LIMIT_SCORE ?? 3),
    capture: Number(process.env.AI_LIMIT_CAPTURE ?? 60),
    ask: Number(process.env.AI_LIMIT_ASK ?? 20),
  } as Record<AiFeature, number>,
  /** Estimated spend caps in US dollars. */
  userMonthlyUsd: Number(process.env.AI_USER_MONTHLY_USD ?? 2),
  appMonthlyUsd: Number(process.env.AI_APP_MONTHLY_USD ?? 25),
});

export const aiFeatures = ["research", "lookup", "radar", "brief", "draft", "card", "chat", "score", "capture", "ask"] as const;
export type AiFeature = (typeof aiFeatures)[number];
export type Tier = "fast" | "strong";

export const aiFeatureLabels: Record<AiFeature, string> = {
  research: "Research",
  lookup: "Look up",
  radar: "Suggested rooms",
  brief: "Briefs",
  draft: "Drafts",
  card: "Card scans",
  chat: "Chat imports",
  score: "Goal fit scores",
  capture: "Quick captures",
  ask: "Ask your network",
};

/** Dollars per million tokens, and per web search. Estimates for the usage meter only. */
const prices: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
};
export const WEB_SEARCH_USD = 0.01;

export function estimateCostMicroUsd(model: string, usage: { input: number; output: number; searches: number }) {
  const p = prices[model] ?? prices["claude-opus-5-5"];
  const usd = (usage.input * p.input + usage.output * p.output) / 1_000_000 + usage.searches * WEB_SEARCH_USD;
  return Math.round(usd * 1_000_000);
}

/** AI is available when the server has a key (tests point ANTHROPIC_BASE_URL at a fake). */
export const isAiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
