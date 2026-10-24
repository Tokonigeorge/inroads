import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractJson, lenient } from "./json";

describe("extractJson", () => {
  it("reads bare JSON, fenced JSON and JSON inside prose", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Sure!\n```json\n{"a":[1,2]}\n```')).toEqual({ a: [1, 2] });
    expect(extractJson('Result: {"a":"}"} done')).toEqual({ a: "}" });
    expect(extractJson("no json here")).toBeUndefined();
  });
});

describe("lenient", () => {
  const s = z.object({ name: z.string(), tags: z.array(z.string()), score: z.number(), level: z.enum(["low", "high"]), inner: z.object({ x: z.string() }) });
  it("fills what's missing so the schema validates", () => {
    expect(lenient(s, { name: "Kemi", score: "80", level: "nope" })).toEqual({ name: "Kemi", tags: [], score: 80, level: "low", inner: { x: "" } });
    expect(s.safeParse(lenient(s, null)).success).toBe(true);
  });
});
