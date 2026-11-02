import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { MessageCreateParamsNonStreaming as BetaMessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import { getAnthropic, type AnthropicLike } from "./client";
import {
  aiConfig,
  estimateCostMicroUsd,
  isAiConfigured,
  type AiFeature,
  type Tier,
} from "./config";
import { extractJson, lenient } from "./json";
import type { Database } from "@/server/db/with-user";
import { checkLimit, recordUsage } from "./limits";
import { INROADS_SYSTEM, type WebMode } from "./prompts/shared";
import type { Source } from "./sources";

export class AiError extends Error {
  constructor(
    public code: "not_configured" | "refused" | "invalid_output" | "failed",
    message: string,
    /** Set when the call failed while web tools were on: worth one retry without them. */
    public webUnavailable = false,
  ) {
    super(message);
  }
}

const BUSY = "Inroads is busy right now. Try again in a minute.";
const NO_ANSWER =
  "Inroads couldn't get an answer this time. Try again shortly.";
const REFUSED =
  "Inroads couldn't do this one. Try rewording it or adding more context.";
const BAD_SHAPE =
  "Inroads couldn't make sense of the answer this time. Try again.";

export type WebOptions = {
  search?: {
    maxUses: number;
    allowedDomains?: string[];
    userLocation?: { city?: string; country?: string; timezone?: string };
  };
  fetch?: { maxUses: number; allowedDomains?: string[] };
};

export type RunInput<T> = {
  feature: AiFeature;
  tier: Tier;
  userId: string;
  /** Defaults to INROADS_SYSTEM, the shared prompt-injection guard. */
  system?: string;
  /** Text, or content blocks (e.g. an image and a question). */
  prompt: string | BetaContentBlockParam[];
  /** With a schema the reply is JSON validated by Zod; without one it's plain text. */
  schema?: z.ZodType<T>;
  web?: WebOptions;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  /** "Searching for …", "Reading linkedin.com": shown on the job while it runs. */
  onProgress?: (step: string) => void;
  /** Skip the per-feature limit (a repair or follow-up call inside one run). */
  skipLimit?: boolean;
  /** Set on the repair call itself, so a bad repair fails instead of repairing again. */
  isRepair?: boolean;
};

export type RunResult<T> = {
  output: T;
  text: string;
  seen: Source[];
  model: string;
};
export type RunDeps = {
  client?: AnthropicLike;
  sys?: Database;
  /**
   * Batch, step 1: build the first request and throw it as `CapturedRequest` instead of sending
   * it, so it can go through the Message Batches API at half price.
   */
  capture?: boolean;
  /** Batch, step 2: the batch's answer to that first request. Billed at half; anything after it (resumed web turns, a repair) runs as usual. */
  firstMessage?: BetaMessage;
};

/** Thrown by `runAI` when `deps.capture` is set: the request it would have sent. */
export class CapturedRequest extends Error {
  constructor(public params: BetaMessageCreateParamsNonStreaming) {
    super("captured");
  }
}

/** The Batches API takes half the token price. */
const BATCH_DISCOUNT = 0.5;

const MAX_CONTINUATIONS = 3;

function tools(web?: WebOptions): BetaToolUnion[] {
  const out: BetaToolUnion[] = [];
  if (web?.search) {
    out.push({
      type: "web_search_20260209",
      name: "web_search",
      max_uses: web.search.maxUses,
      ...(web.search.allowedDomains?.length
        ? { allowed_domains: web.search.allowedDomains }
        : {}),
      ...(web.search.userLocation
        ? {
            user_location: {
              type: "approximate" as const,
              ...web.search.userLocation,
            },
          }
        : {}),
    });
  }
  if (web?.fetch) {
    out.push({
      type: "web_fetch_20260209",
      name: "web_fetch",
      max_uses: web.fetch.maxUses,
      ...(web.fetch.allowedDomains?.length
        ? { allowed_domains: web.fetch.allowedDomains }
        : {}),
    });
  }
  return out;
}

const textOf = (content: BetaContentBlock[]) =>
  content
    .filter(
      (b): b is Extract<BetaContentBlock, { type: "text" }> =>
        b.type === "text",
    )
    .map((b) => b.text)
    .join("")
    .trim();

function seenSources(content: BetaContentBlock[]): Source[] {
  const out: Source[] = [];
  for (const b of content) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content)
        if (r.type === "web_search_result")
          out.push({ title: r.title, url: r.url });
    }
    if (
      b.type === "web_fetch_tool_result" &&
      b.content.type === "web_fetch_result"
    )
      out.push({ title: b.content.url, url: b.content.url });
  }
  return out;
}

function progressFor(block: BetaContentBlock): string | null {
  if (block.type !== "server_tool_use") return null;
  const input = block.input as { query?: string; url?: string };
  if (block.name === "web_search" && input.query)
    return `Searching for "${input.query}"`;
  if (block.name === "web_fetch" && input.url) {
    try {
      return `Reading ${new URL(input.url).hostname.replace(/^www\./, "")}`;
    } catch {
      return "Reading a page";
    }
  }
  return null;
}

/**
 * The one way the app calls the model (TECH_PLAN §5.1). Checks limits, streams the request
 * (resuming paused server-tool turns), reports web activity as progress, validates JSON with
 * Zod (structured outputs when no web tools are used; otherwise the JSON is pulled from the
 * reply and, if it doesn't validate, repaired once), records usage, and maps refusals and
 * failures to plain messages.
 */
export async function runAI<T = string>(
  input: RunInput<T>,
  deps: RunDeps = {},
): Promise<RunResult<T>> {
  if (!deps.client && !isAiConfigured())
    throw new AiError(
      "not_configured",
      "AI features aren't set up on this server yet.",
    );
  // A batch answer was already checked against the limits when it was submitted.
  if (!input.skipLimit && !deps.firstMessage)
    await checkLimit(input.userId, input.feature, deps.sys);
  const client = deps.client ?? getAnthropic();
  const cfg = aiConfig();
  const model = cfg.models[input.tier];
  const webTools = tools(input.web);
  const structured = Boolean(input.schema) && !webTools.length;
  const strong = input.tier === "strong";

  const messages: BetaMessageParam[] = [
    { role: "user", content: input.prompt },
  ];
  let final: BetaMessage | null = null;
  const totals = {
    input: 0,
    output: 0,
    searches: 0,
    cacheRead: 0,
    cacheWrite: 0,
    turns: 0,
  };
  // The model that actually answered: a strong-tier request can fall back to another one.
  let served = model;
  // What the batch answer cost (half price), kept apart from full-price turns.
  let batchCost = 0;
  try {
    for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
      if (turn === 0 && (deps.capture || deps.firstMessage)) {
        if (deps.capture) {
          throw new CapturedRequest({
            model,
            max_tokens: input.maxTokens ?? 16000,
            system: input.system ?? INROADS_SYSTEM,
            messages: [...messages],
            ...(webTools.length ? { tools: webTools } : {}),
            output_config: {
              effort: input.effort ?? (strong ? "medium" : "low"),
              ...(structured
                ? { format: betaZodOutputFormat(input.schema as z.ZodType) }
                : {}),
            },
            // No server-side fallback here: the Batches API doesn't take it.
          } as BetaMessageCreateParamsNonStreaming);
        }
        final = deps.firstMessage!;
        const u = final.usage;
        batchCost =
          BATCH_DISCOUNT *
          estimateCostMicroUsd(final.model || model, {
            input: u.input_tokens,
            output: u.output_tokens,
            searches: u.server_tool_use?.web_search_requests ?? 0,
            cacheRead: u.cache_read_input_tokens ?? 0,
            cacheWrite: u.cache_creation_input_tokens ?? 0,
          });
        totals.input += u.input_tokens;
        totals.output += u.output_tokens;
        totals.searches += u.server_tool_use?.web_search_requests ?? 0;
        totals.cacheRead += u.cache_read_input_tokens ?? 0;
        totals.cacheWrite += u.cache_creation_input_tokens ?? 0;
        totals.turns++;
        if (final.model) served = final.model;
        if (final.stop_reason !== "pause_turn") break;
        messages.push({
          role: "assistant",
          content: final.content as BetaContentBlockParam[],
        });
        continue;
      }
      const stream = client.beta.messages.stream({
        model,
        max_tokens: input.maxTokens ?? 16000,
        system: input.system ?? INROADS_SYSTEM,
        messages,
        ...(webTools.length ? { tools: webTools } : {}),
        output_config: {
          effort: input.effort ?? (strong ? "medium" : "low"),
          ...(structured
            ? { format: betaZodOutputFormat(input.schema as z.ZodType) }
            : {}),
        },
        // Strong-tier requests fall back to another model if one declines (server-side, by category).
        ...(strong
          ? {
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default" as const,
            }
          : {}),
      });
      if (input.onProgress) {
        stream.on("contentBlock", (block) => {
          const step = progressFor(block);
          if (step) input.onProgress!(step);
        });
      }
      final = await stream.finalMessage();
      totals.input += final.usage.input_tokens;
      totals.output += final.usage.output_tokens;
      totals.searches += final.usage.server_tool_use?.web_search_requests ?? 0;
      totals.cacheRead += final.usage.cache_read_input_tokens ?? 0;
      totals.cacheWrite += final.usage.cache_creation_input_tokens ?? 0;
      totals.turns++;
      if (final.model) served = final.model;
      if (final.stop_reason !== "pause_turn") break;
      // A long server-tool turn paused: send it back and the server resumes.
      messages.push({
        role: "assistant",
        content: final.content as BetaContentBlockParam[],
      });
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError)
      throw new AiError("failed", BUSY);
    // With web tools on, a rejected request (tools not enabled, or the tools failing) gets one retry without them.
    if (e instanceof Anthropic.APIError)
      throw new AiError(
        "failed",
        NO_ANSWER,
        webTools.length > 0 && e.status !== 401 && e.status !== 413,
      );
    throw e;
  } finally {
    if (totals.input || totals.output) {
      await recordUsage(
        {
          userId: input.userId,
          feature: input.feature,
          model: served,
          inputTokens: totals.input,
          outputTokens: totals.output,
          cacheReadTokens: totals.cacheRead,
          cacheWriteTokens: totals.cacheWrite,
          turns: totals.turns,
          webSearches: totals.searches,
          // A batch answer counts at half: full price for everything, less the half saved on it.
          costMicroUsd: Math.max(
            0,
            estimateCostMicroUsd(served, totals) - batchCost,
          ),
        },
        deps.sys,
      ).catch(() => undefined);
    }
  }
  if (!final) throw new AiError("failed", NO_ANSWER);
  if (final.stop_reason === "refusal") throw new AiError("refused", REFUSED);

  const text = textOf(final.content);
  const seen = seenSources(final.content);
  if (!input.schema) return { output: text as T, text, seen, model };

  const raw = extractJson(text);
  const parsed = input.schema.safeParse(
    raw === undefined ? raw : lenient(input.schema, raw),
  );
  if (parsed.success) return { output: parsed.data, text, seen, model };
  if (input.isRepair) throw new AiError("invalid_output", BAD_SHAPE);

  // One repair: ask the fast model to restate the answer in the exact schema.
  const repair = await runAI(
    {
      feature: input.feature,
      tier: "fast",
      userId: input.userId,
      skipLimit: true,
      isRepair: true,
      schema: input.schema,
      prompt: `Rewrite this answer as JSON that matches the required schema exactly. Keep every fact and URL; don't add new ones.\n\nANSWER:\n"""\n${text.slice(0, 40000)}\n"""`,
    },
    deps,
  ).catch(() => null);
  if (!repair) throw new AiError("invalid_output", BAD_SHAPE);
  return { output: repair.output, text, seen, model };
}

/**
 * A web call with the prototype's knowledge-mode fallback (askClaude, L1423): if the request
 * fails with the web tools on, it's sent once more without them, with the prompt built for
 * "knowledge" mode (no tools, sources [], say what to verify). The result says which it was.
 */
export async function runWithWebFallback<T>(
  input: Omit<RunInput<T>, "prompt" | "web"> & {
    web: WebOptions;
    prompt: (mode: WebMode) => RunInput<T>["prompt"];
  },
  deps: RunDeps = {},
): Promise<RunResult<T> & { mode: WebMode }> {
  const { prompt, web, ...rest } = input;
  try {
    return {
      ...(await runAI({ ...rest, web, prompt: prompt("web") }, deps)),
      mode: "web",
    };
  } catch (e) {
    if (!(e instanceof AiError) || !e.webUnavailable) throw e;
    input.onProgress?.(
      "Web search isn't available, so answering from what's already known",
    );
    return {
      ...(await runAI(
        { ...rest, skipLimit: true, prompt: prompt("knowledge") },
        deps,
      )),
      mode: "knowledge",
    };
  }
}
