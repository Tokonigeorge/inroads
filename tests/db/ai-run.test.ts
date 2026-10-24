import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { AiLimitError } from "@/server/ai/limits";
import { AiError, runAI } from "@/server/ai/run";
import { fakeAnthropic } from "../fixtures/fake-anthropic";
import { connect, createUser } from "./helpers";

process.env.ANTHROPIC_API_KEY ??= "test-key";
const { sql, sys } = connect();
let user: { id: string };
afterAll(() => sql.end());
beforeAll(async () => {
  user = await createUser(sql, "AI Runner");
});

const schema = z.object({ summary: z.string(), sources: z.array(z.object({ title: z.string(), url: z.string() })) });

describe("runAI", () => {
  it("uses structured outputs without web tools, and records usage", async () => {
    const fake = fakeAnthropic(() => ({ json: { summary: "Partner at Kestrel", sources: [] } }));
    const r = await runAI({ feature: "draft", tier: "fast", userId: user.id, prompt: "Hi", schema }, { client: fake.client, sys });
    expect(r.output).toEqual({ summary: "Partner at Kestrel", sources: [] });
    expect(fake.calls[0].model).toBe("claude-haiku-5-5");
    expect(fake.calls[0].output_config?.format).toBeTruthy();
    expect(fake.calls[0].fallbacks).toBeUndefined();
    const [u] = await sql`select feature, model, input_tokens, cost_micro_usd from ai_usage where user_id = ${user.id}`;
    expect(u).toMatchObject({ feature: "draft", model: "claude-haiku-5-5", input_tokens: 1200 });
    expect(u.cost_micro_usd).toBeGreaterThan(0);
  });

  it("with web tools: no structured format, JSON pulled from the reply, progress from searches, fallback on", async () => {
    const steps: string[] = [];
    const fake = fakeAnthropic(() => ({
      searches: [{ query: "Adaeze Okafor Kestrel", results: [{ title: "Adaeze Okafor | LinkedIn", url: "https://www.linkedin.com/in/adaeze" }] }],
      text: 'Here you go:\n```json\n{"summary":"VC","sources":[]}\n```',
    }));
    const r = await runAI(
      { feature: "research", tier: "strong", userId: user.id, prompt: "Research", schema, web: { search: { maxUses: 4 }, fetch: { maxUses: 3 } }, onProgress: (s) => steps.push(s) },
      { client: fake.client, sys },
    );
    expect(r.output.summary).toBe("VC");
    expect(r.seen).toEqual([{ title: "Adaeze Okafor | LinkedIn", url: "https://www.linkedin.com/in/adaeze" }]);
    expect(steps).toEqual(['Searching for "Adaeze Okafor Kestrel"']);
    const req = fake.calls[0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.output_config?.format).toBeUndefined();
    expect(req.tools?.map((t) => t.type)).toEqual(["web_search_20260209", "web_fetch_20260209"]);
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toEqual(["server-side-fallback-2026-07-01"]);
  });

  it("repairs a reply in the wrong shape once, then gives a plain error", async () => {
    const fake = fakeAnthropic((_req, n) => (n === 1 ? { text: "Sorry, here is prose" } : { json: { summary: "fixed", sources: [] } }));
    const r = await runAI({ feature: "research", tier: "strong", userId: user.id, prompt: "x", schema, web: { search: { maxUses: 1 } } }, { client: fake.client, sys });
    expect(r.output.summary).toBe("fixed");
    expect(fake.calls[1].model).toBe("claude-haiku-5-5");
    const broken = fakeAnthropic(() => ({ text: "never JSON" }));
    await expect(runAI({ feature: "research", tier: "strong", userId: user.id, prompt: "x", schema, web: { search: { maxUses: 1 } } }, { client: broken.client, sys })).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("resumes paused turns and maps refusals", async () => {
    const paused = fakeAnthropic((_req, n) => (n === 1 ? { text: "", stop: "pause_turn" } : { text: "done" }));
    const r = await runAI({ feature: "brief", tier: "strong", userId: user.id, prompt: "x" }, { client: paused.client, sys });
    expect(r.output).toBe("done");
    expect(paused.calls[1].messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    const refused = fakeAnthropic(() => ({ text: "", stop: "refusal" }));
    await expect(runAI({ feature: "brief", tier: "strong", userId: user.id, prompt: "x" }, { client: refused.client, sys })).rejects.toBeInstanceOf(AiError);
  });

  it("enforces the per-feature daily limit", async () => {
    const other = await createUser(sql, "AI Limited");
    for (let i = 0; i < 5; i++) await sql`insert into ai_usage (user_id, feature, model, cost_micro_usd) values (${other.id}, 'lookup', 'm', 1)`;
    const fake = fakeAnthropic(() => ({ text: "x" }));
    await expect(runAI({ feature: "lookup", tier: "strong", userId: other.id, prompt: "x" }, { client: fake.client, sys })).rejects.toBeInstanceOf(AiLimitError);
    expect(fake.calls).toHaveLength(0);
    // The monthly allowance too.
    await sql`insert into ai_usage (user_id, feature, model, cost_micro_usd) values (${other.id}, 'draft', 'm', 2000000)`;
    await expect(runAI({ feature: "draft", tier: "fast", userId: other.id, prompt: "x" }, { client: fake.client, sys })).rejects.toThrow(/this month's AI allowance/);
  });
});
