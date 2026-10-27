import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isValidTimeZone } from "@/domain/zoned";
import { apiRoute } from "@/server/api";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";

const body = z.object({ timezone: z.string().max(64), language: z.string().max(35) });

/**
 * First use (no set-up wizard, as in the prototype): take your time zone and phone region from the
 * browser, once. Changing them later is on the Account page; this never overwrites that.
 */
export const POST = apiRoute(async (req, user) => {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 422 });
  const { timezone, language } = parsed.data;
  const region = /-([A-Z]{2})\b/i.exec(language)?.[1]?.toUpperCase();
  const updated = await db.withUser(user.id, async (tx) => {
    const [p] = await tx.select({ state: t.profiles.onboardingState }).from(t.profiles).where(eq(t.profiles.userId, user.id));
    // Only brand-new accounts: anyone who already set up (or set this on Account) keeps theirs.
    const state = (p?.state ?? {}) as { localeFrom?: string; completedAt?: string };
    if (!p || state.localeFrom || state.completedAt) return false;
    await tx
      .update(t.profiles)
      .set({
        ...(isValidTimeZone(timezone) ? { timezone } : {}),
        ...(region ? { defaultRegion: region } : {}),
        onboardingState: sql`${t.profiles.onboardingState} || ${JSON.stringify({ localeFrom: "browser", completedAt: new Date().toISOString() })}::jsonb`,
      })
      .where(eq(t.profiles.userId, user.id));
    return true;
  });
  return NextResponse.json({ ok: true, updated });
});
