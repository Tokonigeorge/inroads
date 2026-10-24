/**
 * A stand-in for the Anthropic client's `beta.messages.stream`, for tests. Each call is
 * recorded; `reply` decides the answer from the request. Also used over HTTP by the e2e
 * fake-services server (see tests/e2e/support/fake-supabase.ts).
 */
export type FakeRequest = {
  model: string;
  system?: string;
  messages: { role: string; content: unknown }[];
  tools?: { type: string; name: string; allowed_domains?: string[] }[];
  output_config?: { effort?: string; format?: unknown };
  betas?: string[];
  fallbacks?: unknown;
};
export type FakeReply = { text?: string; json?: unknown; searches?: { query: string; results: { title: string; url: string }[] }[]; stop?: "end_turn" | "refusal" | "pause_turn" };

export const promptText = (req: FakeRequest) =>
  req.messages
    .map((m) => (typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((b: { text?: string }) => b.text ?? "").join("\n") : ""))
    .join("\n");

/** Builds the response body the API would send for a reply. */
export function fakeMessage(req: FakeRequest, reply: FakeReply) {
  const content: Record<string, unknown>[] = [];
  for (const [i, s] of (reply.searches ?? []).entries()) {
    content.push({ type: "server_tool_use", id: `srvtoolu_${i}`, name: "web_search", input: { query: s.query } });
    content.push({ type: "web_search_tool_result", tool_use_id: `srvtoolu_${i}`, content: s.results.map((r) => ({ type: "web_search_result", title: r.title, url: r.url, encrypted_content: "x", page_age: null })) });
  }
  content.push({ type: "text", text: reply.text ?? JSON.stringify(reply.json ?? {}), citations: null });
  return {
    id: `msg_fake_${Math.random().toString(36).slice(2)}`,
    type: "message",
    role: "assistant",
    model: req.model,
    content,
    stop_reason: reply.stop ?? "end_turn",
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    usage: {
      input_tokens: 1200,
      output_tokens: 400,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: null,
      server_tool_use: { web_search_requests: reply.searches?.length ?? 0, web_fetch_requests: 0 },
      service_tier: "standard",
      inference_geo: null,
      iterations: null,
      output_tokens_details: null,
      fallback_credit: null,
      speed: null,
    },
  };
}

export function fakeAnthropic(reply: (req: FakeRequest, n: number) => FakeReply) {
  const calls: FakeRequest[] = [];
  const client = {
    beta: {
      messages: {
        stream(params: FakeRequest) {
          calls.push(params);
          const msg = fakeMessage(params, reply(params, calls.length));
          const handlers: ((b: unknown) => void)[] = [];
          return {
            on(event: string, fn: (b: unknown) => void) {
              if (event === "contentBlock") handlers.push(fn);
              return this;
            },
            async finalMessage() {
              for (const b of msg.content) handlers.forEach((h) => h(b));
              return msg;
            },
          };
        },
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls };
}
