import { z } from "zod";

/** Pulls the JSON value out of a model reply that may wrap it in prose or a code fence. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    // fall through
  }
  const starts = [body.indexOf("{"), body.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) return undefined;
  const start = Math.min(...starts);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (end <= start) return undefined;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return undefined;
  }
}


/**
 * Fills in missing or mistyped fields with empty values (`""`, `[]`, `0`, the first enum value),
 * following the schema's shape, so a reply that skipped a field still validates. Used on JSON
 * pulled from web-tool replies, where structured outputs aren't available.
 */
export function lenient(schema: z.ZodType, value: unknown): unknown {
  if (schema instanceof z.ZodObject) {
    const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(schema.shape as Record<string, z.ZodType>)) out[k] = lenient(s, v[k]);
    return out;
  }
  if (schema instanceof z.ZodArray) return Array.isArray(value) ? value.map((x) => lenient(schema.element as z.ZodType, x)) : [];
  if (schema instanceof z.ZodString) return typeof value === "string" ? value : value == null ? "" : String(value);
  if (schema instanceof z.ZodNumber) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (schema instanceof z.ZodBoolean) return Boolean(value);
  if (schema instanceof z.ZodEnum) {
    const options = schema.options as string[];
    return options.includes(value as string) ? value : options[0];
  }
  if (schema instanceof z.ZodNullable) return value == null ? null : lenient(schema.unwrap() as z.ZodType, value);
  return value;
}
