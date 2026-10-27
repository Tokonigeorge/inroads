import "server-only";
import { firstIssue } from "@/contracts/issues";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { birthdaySchema, isoDateSchema, socialKeys } from "@/contracts/people";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { linkPeople } from "./goals";
import { addPromise, logTouch } from "./people";
import type { Result } from "./spaces";

/**
 * Everything AI wants to change waits here for the user (TECH_PLAN §5.2). Accepting runs the
 * normal validated change; nothing is written without it.
 */
export const suggestionPayloads = {
  person_field: z.object({ personId: z.string().uuid(), field: z.enum(["position", "company", "city", "birthday"]), value: z.string().trim().min(1).max(200) }),
  social: z.object({ personId: z.string().uuid(), key: z.enum(socialKeys), value: z.string().trim().url().max(300) }),
  goal_link: z.object({ personId: z.string().uuid(), goalId: z.string().uuid(), goalText: z.string() }),
  interaction: z.object({ personId: z.string().uuid(), spaceId: z.string().uuid(), occurredOn: isoDateSchema, summary: z.string().trim().min(1).max(500) }),
  commitment: z.object({ personId: z.string().uuid(), spaceId: z.string().uuid(), text: z.string().trim().min(1).max(300), owner: z.enum(["me", "them"]), dueOn: isoDateSchema.nullable() }),
  interests: z.object({ personId: z.string().uuid(), spaceId: z.string().uuid(), values: z.array(z.string().trim().min(1).max(40)).min(1).max(12) }),
  note: z.object({ personId: z.string().uuid(), spaceId: z.string().uuid(), text: z.string().trim().min(1).max(2000) }),
} as const;
export type SuggestionKind = keyof typeof suggestionPayloads;
export const aiSuggestionKinds = Object.keys(suggestionPayloads) as SuggestionKind[];

export type NewSuggestion = { kind: SuggestionKind; payload: Record<string, unknown>; why: string; sources?: { title: string; url: string }[]; spaceId: string; targetId: string };

/** Same keys in any order give the same text, so stored jsonb compares with what we'd insert. */
const canonical = (v: unknown): string =>
  v && typeof v === "object" && !Array.isArray(v)
    ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`
    : JSON.stringify(v);

/**
 * Saves suggestions, skipping any already waiting or already dismissed for the same person (re-running
 * research shouldn't repeat itself, or bring back what you said no to).
 */
export async function createSuggestions(tx: Tx, userId: string, origin: string, originId: string | null, list: NewSuggestion[]) {
  const checked = list.filter((s) => suggestionPayloads[s.kind].safeParse(s.payload).success);
  if (!checked.length) return 0;
  const targets = [...new Set(checked.map((s) => s.targetId))];
  const seen = new Set(
    (
      await tx
        .select({ targetId: t.suggestions.targetId, kind: t.suggestions.kind, payload: t.suggestions.payload })
        .from(t.suggestions)
        .where(and(inArray(t.suggestions.targetId, targets), inArray(t.suggestions.status, ["pending", "dismissed"])))
    ).map((x) => `${x.targetId}|${x.kind}|${canonical(x.payload)}`),
  );
  const valid = checked.filter((s) => {
    const key = `${s.targetId}|${s.kind}|${canonical(s.payload)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!valid.length) return 0;
  await tx.insert(t.suggestions).values(
    valid.map((s) => ({ userId, spaceId: s.spaceId, kind: s.kind, targetType: "person", targetId: s.targetId, payload: s.payload, why: s.why.slice(0, 500), sources: s.sources ?? [], origin, originId })),
  );
  return valid.length;
}

export async function pendingForPerson(tx: Tx, personId: string) {
  return tx
    .select({ id: t.suggestions.id, kind: t.suggestions.kind, payload: t.suggestions.payload, why: t.suggestions.why, sources: t.suggestions.sources, spaceId: t.suggestions.spaceId, createdAt: t.suggestions.createdAt })
    .from(t.suggestions)
    .where(and(eq(t.suggestions.targetId, personId), eq(t.suggestions.status, "pending"), inArray(t.suggestions.kind, aiSuggestionKinds)))
    .orderBy(desc(t.suggestions.createdAt))
    .limit(50);
}

export async function countPendingAiSuggestions(tx: Tx, spaceId: string | null) {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(t.suggestions)
    .where(and(eq(t.suggestions.status, "pending"), inArray(t.suggestions.kind, aiSuggestionKinds), spaceId ? eq(t.suggestions.spaceId, spaceId) : undefined));
  return r?.n ?? 0;
}

const fail = (message: string): Result<never> => ({ ok: false, message });

/** Accepts a suggestion, optionally with the value the user edited. */
export async function acceptSuggestion(tx: Tx, userId: string, id: string, editedValue?: string): Promise<Result<null>> {
  const [s] = await tx.select().from(t.suggestions).where(and(eq(t.suggestions.id, id), eq(t.suggestions.status, "pending")));
  if (!s) return fail("That suggestion was already handled.");
  const kind = s.kind as SuggestionKind;
  const schema = suggestionPayloads[kind];
  if (!schema) return fail("That suggestion can't be applied.");
  const raw = { ...(s.payload as Record<string, unknown>) };
  if (editedValue !== undefined) {
    if (kind === "person_field" || kind === "social") raw.value = editedValue;
    else if (kind === "interaction" || kind === "note") raw[kind === "note" ? "text" : "summary"] = editedValue;
    else if (kind === "commitment") raw.text = editedValue;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail(firstIssue(parsed.error, "Check the value."));
  const p = parsed.data as Record<string, unknown> & { personId: string };

  switch (kind) {
    case "person_field": {
      const v = p as z.infer<typeof suggestionPayloads.person_field>;
      if (v.field === "birthday" && !birthdaySchema.safeParse(v.value).success) return fail("Use a birthday like 03-14.");
      await tx.update(t.people).set({ [v.field]: v.value }).where(eq(t.people.id, v.personId));
      break;
    }
    case "social": {
      const v = p as z.infer<typeof suggestionPayloads.social>;
      await tx.update(t.people).set({ socials: sql`${t.people.socials} || ${JSON.stringify({ [v.key]: v.value })}::jsonb` }).where(eq(t.people.id, v.personId));
      break;
    }
    case "goal_link": {
      const v = p as z.infer<typeof suggestionPayloads.goal_link>;
      const r = await linkPeople(tx, userId, v.goalId, [v.personId]);
      if (!r.ok) return r;
      break;
    }
    case "interaction": {
      const v = p as z.infer<typeof suggestionPayloads.interaction>;
      const r = await logTouch(tx, userId, { id: randomUUID(), personId: v.personId, spaceId: v.spaceId, occurredOn: v.occurredOn, type: "message", summary: v.summary });
      if (!r.ok) return r;
      break;
    }
    case "commitment": {
      const v = p as z.infer<typeof suggestionPayloads.commitment>;
      const r = await addPromise(tx, userId, { id: randomUUID(), personId: v.personId, spaceId: v.spaceId, text: v.text, owner: v.owner, dueOn: v.dueOn });
      if (!r.ok) return r;
      break;
    }
    case "interests": {
      const v = p as z.infer<typeof suggestionPayloads.interests>;
      await tx.execute(sql`update person_spaces set interests = array(select distinct unnest(interests || ${v.values}::text[])) where person_id = ${v.personId} and space_id = ${v.spaceId}`);
      break;
    }
    case "note": {
      const v = p as z.infer<typeof suggestionPayloads.note>;
      await tx.execute(sql`update person_spaces set notes = case when notes is null or notes = '' then ${v.text} else notes || E'\n\n' || ${v.text} end where person_id = ${v.personId} and space_id = ${v.spaceId}`);
      break;
    }
  }
  await tx.update(t.suggestions).set({ status: editedValue !== undefined ? "edited" : "accepted", resolvedAt: new Date() }).where(eq(t.suggestions.id, id));
  return { ok: true, data: null };
}

export async function discardSuggestion(tx: Tx, id: string) {
  await tx.update(t.suggestions).set({ status: "dismissed", resolvedAt: new Date() }).where(and(eq(t.suggestions.id, id), eq(t.suggestions.status, "pending")));
}

/** Every pending AI suggestion, newest first, with the person's name, for the review page. */
export async function listPendingAiSuggestions(tx: Tx, spaceId: string | null, limit = 100) {
  return tx
    .select({ id: t.suggestions.id, kind: t.suggestions.kind, payload: t.suggestions.payload, why: t.suggestions.why, sources: t.suggestions.sources, spaceId: t.suggestions.spaceId, createdAt: t.suggestions.createdAt, personId: t.people.id, name: t.people.name })
    .from(t.suggestions)
    .innerJoin(t.people, eq(t.people.id, t.suggestions.targetId))
    .where(and(eq(t.suggestions.status, "pending"), inArray(t.suggestions.kind, aiSuggestionKinds), sql`${t.people.deletedAt} is null`, spaceId ? eq(t.suggestions.spaceId, spaceId) : undefined))
    .orderBy(desc(t.suggestions.createdAt))
    .limit(limit);
}
