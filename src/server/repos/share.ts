import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { SharedInput, SocialKey } from "@/domain/share";
import * as t from "@/server/db/schema";
import type { Tx } from "@/server/db/with-user";

const clip = (s: FormDataEntryValue | string | null | undefined, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

/**
 * Something shared into Inroads waits as a `share` import until you add it or discard it, so the
 * shared text never sits in a URL (or server logs). Unhandled shares are deleted after 2 days.
 */
export async function stageShare(tx: Tx, userId: string, spaceId: string, input: SharedInput) {
  const options = { title: clip(input.title, 300), text: clip(input.text, 4000), url: clip(input.url, 2000) };
  const [row] = await tx.insert(t.imports).values({ userId, spaceId, type: "share", status: "review", options }).returning({ id: t.imports.id });
  return row.id;
}

export async function getShare(tx: Tx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await tx
    .select({ id: t.imports.id, spaceId: t.imports.spaceId, options: t.imports.options })
    .from(t.imports)
    .where(and(eq(t.imports.id, id), eq(t.imports.type, "share"), eq(t.imports.status, "review")));
  return row ? { id: row.id, spaceId: row.spaceId, input: row.options as SharedInput } : null;
}

export async function discardShare(tx: Tx, id: string) {
  await tx.delete(t.imports).where(and(eq(t.imports.id, id), eq(t.imports.type, "share")));
}

const comparable = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.|m\.|mobile\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

/** Someone you already have with this profile link, so a share doesn't add them twice. */
export async function personWithSocial(tx: Tx, key: SocialKey, url: string) {
  const [row] = await tx
    .select({ id: t.people.id, name: t.people.name })
    .from(t.people)
    .where(
      and(
        isNull(t.people.deletedAt),
        sql`lower(regexp_replace(regexp_replace(${t.people.socials} ->> ${key}, '^https?://(www\\.|m\\.|mobile\\.)?', ''), '/+$', '')) = ${comparable(url)}`,
      ),
    )
    .limit(1);
  return row ?? null;
}
