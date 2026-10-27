import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { IsoDate } from "@/domain/dates";
import { planImport, type IncomingContact } from "@/domain/dedupe";
import type { IcsEvent } from "@/importers/ics";
import type { ParsedFiles } from "@/importers/files";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";
import { applyCalendar, type CalendarSummary } from "./calendar";
import { applyContacts, loadExisting, type ContactsSummary } from "./contacts";
import { finishImport, startImport } from "./imports";
import { computeTriageSuggestions } from "./triage";

export type StagedCounts = { found: number; add: number; fill: number; unchanged: number; possibleDuplicates: number; events: number; nameless?: number };
/** The review's choices (prototype L2305–2326). */
export type CommitOptions = { contacts: boolean; skipNameless: boolean; calendars: string[] | null; includeSolo: boolean };
export const defaultCommitOptions: CommitOptions = { contacts: true, skipNameless: false, calendars: null, includeSolo: false };
export type StagedFile = { files: ParsedFiles["files"]; errors: string[]; planned: StagedCounts };

const CHUNK = 500;

/**
 * Parsed files wait in `import_items` until the user has looked at what will happen. Nothing
 * touches their people until they commit. The files themselves are never stored.
 */
export async function stageFileImport(tx: Tx, input: { userId: string; spaceId: string; parsed: ParsedFiles }) {
  const imp = await startImport(tx, { userId: input.userId, spaceId: input.spaceId, type: "file" });
  const plan = planImport(await loadExisting(tx), input.parsed.contacts);
  const byExternal = new Map(input.parsed.contacts.map((c) => [c.externalId, c]));
  const items: (typeof t.importItems.$inferInsert)[] = [
    ...plan.adds.map(({ contact }) => ({ importId: imp.id, userId: input.userId, kind: "person", raw: {}, normalised: contact, action: "add" })),
    ...plan.merges.map((m) => ({ importId: imp.id, userId: input.userId, kind: "person", raw: { patch: m.patch }, normalised: byExternal.get(m.externalId) ?? {}, matchPersonId: m.personId, matchKind: "merge", action: Object.keys(m.patch).length ? "merge" : "skip" })),
    ...input.parsed.events.map((e) => ({ importId: imp.id, userId: input.userId, kind: "event", raw: {}, normalised: e, action: "add" })),
  ];
  for (let i = 0; i < items.length; i += CHUNK) await tx.insert(t.importItems).values(items.slice(i, i + CHUNK));
  const fills = plan.merges.filter((m) => Object.keys(m.patch).length).length;
  const planned: StagedCounts = {
    found: input.parsed.contacts.length,
    add: plan.adds.length,
    fill: fills,
    unchanged: plan.unchanged.length + plan.merges.length - fills,
    possibleDuplicates: plan.possibleDuplicates.length,
    events: input.parsed.events.length,
    nameless: plan.adds.filter(({ contact }) => !contact.hasName).length,
  };
  await tx
    .update(t.imports)
    .set({ status: "review", counts: { files: input.parsed.files, errors: input.parsed.errors, planned } satisfies StagedFile })
    .where(eq(t.imports.id, imp.id));
  return { importId: imp.id, planned };
}

export async function getStagedImport(tx: Tx, importId: string, opts: { page: number; pageSize?: number }) {
  const [imp] = await tx.select().from(t.imports).where(eq(t.imports.id, importId));
  if (!imp) return null;
  const size = opts.pageSize ?? 50;
  const [adds, fills] = await Promise.all([
    tx
      .select({ id: t.importItems.id, normalised: t.importItems.normalised })
      .from(t.importItems)
      .where(and(eq(t.importItems.importId, importId), eq(t.importItems.kind, "person"), eq(t.importItems.action, "add")))
      .orderBy(asc(sql`${t.importItems.normalised} ->> 'name'`), asc(t.importItems.id))
      .limit(size)
      .offset(Math.max(0, opts.page) * size),
    tx
      .select({ id: t.importItems.id, raw: t.importItems.raw, name: t.people.name, personId: t.people.id })
      .from(t.importItems)
      .innerJoin(t.people, eq(t.people.id, t.importItems.matchPersonId))
      .where(and(eq(t.importItems.importId, importId), eq(t.importItems.action, "merge")))
      .orderBy(asc(t.people.name))
      .limit(20),
  ]);
  return {
    import: imp,
    counts: imp.counts as StagedFile,
    adds: adds.map((a) => a.normalised as IncomingContact),
    fills: fills.map((f) => ({ personId: f.personId, name: f.name, fields: Object.keys((f.raw as { patch?: object }).patch ?? {}).filter((k) => k !== "hasName") })),
    page: opts.page,
    pageSize: size,
  };
}

/** Applies a reviewed import through the same pipeline as connected accounts, then forgets the staged rows. */
export async function commitFileImport(
  tx: Tx,
  input: { userId: string; importId: string; spaceId: string; today: IsoDate; meEmails: string[]; options?: CommitOptions },
): Promise<{ contacts: ContactsSummary | null; calendar: CalendarSummary | null } | null> {
  const o = input.options ?? defaultCommitOptions;
  const [imp] = await tx.select().from(t.imports).where(and(eq(t.imports.id, input.importId), eq(t.imports.status, "review")));
  if (!imp) return null;
  const items = await tx.select({ kind: t.importItems.kind, action: t.importItems.action, normalised: t.importItems.normalised }).from(t.importItems).where(eq(t.importItems.importId, input.importId));
  // "Skip entries with no name" only leaves out new entries; details for people you have still fill in.
  const contacts = o.contacts
    ? items.filter((i) => i.kind === "person" && !(o.skipNameless && i.action === "add" && !(i.normalised as IncomingContact).hasName)).map((i) => i.normalised as IncomingContact)
    : [];
  const events = items.filter((i) => i.kind === "event").map((i) => i.normalised as IcsEvent).filter((e) => !o.calendars || o.calendars.includes(e.calendar ?? ""));
  await tx.update(t.imports).set({ status: "committing", spaceId: input.spaceId }).where(eq(t.imports.id, imp.id));
  const ctx = { userId: input.userId, importId: imp.id, spaceId: input.spaceId, today: input.today, source: "file" };
  const c = contacts.length ? await applyContacts(tx, ctx, contacts) : null;
  const cal = events.length ? await applyCalendar(tx, { ...ctx, source: "calendar", meEmails: input.meEmails, connectionId: null, includeSolo: o.includeSolo }, events) : null;
  await computeTriageSuggestions(tx, { today: input.today, importId: imp.id });
  await tx.delete(t.importItems).where(eq(t.importItems.importId, imp.id));
  await finishImport(tx, imp.id, { ...(imp.counts as object), contacts: c, calendar: cal });
  return { contacts: c, calendar: cal };
}

export async function cancelFileImport(tx: Tx, importId: string) {
  await tx.delete(t.importItems).where(eq(t.importItems.importId, importId));
  await tx.update(t.imports).set({ status: "cancelled" }).where(and(eq(t.imports.id, importId), eq(t.imports.status, "review")));
}
