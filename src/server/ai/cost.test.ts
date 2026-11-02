import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { estimateCostMicroUsd } = await import("./config");

describe("estimateCostMicroUsd", () => {
  it("prices cache reads at a tenth and writes at 1.25× the input price", () => {
    // Opus 5.5: $4 in, $20 out per million.
    expect(estimateCostMicroUsd("claude-opus-5-5", { input: 1_000_000, output: 0, searches: 0 })).toBe(4_000_000);
    expect(estimateCostMicroUsd("claude-opus-5-5", { input: 0, output: 0, searches: 0, cacheRead: 1_000_000 })).toBe(400_000);
    expect(estimateCostMicroUsd("claude-opus-5-5", { input: 0, output: 0, searches: 0, cacheWrite: 1_000_000 })).toBe(5_000_000);
  });

  it("knows a dated model id by its family, and adds web searches", () => {
    expect(estimateCostMicroUsd("claude-haiku-5-5-20261001", { input: 1_000_000, output: 1_000_000, searches: 2 })).toBe(100_000 + 500_000 + 20_000);
  });
});
