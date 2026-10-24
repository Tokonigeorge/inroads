import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/** The one Anthropic client. Server only: the key never reaches the browser. */
export function getAnthropic(): Anthropic {
  // Reads ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL (tests) from the environment.
  client ??= new Anthropic({ maxRetries: 2, timeout: 280_000 });
  return client;
}

export type AnthropicLike = Pick<Anthropic, "beta">;
