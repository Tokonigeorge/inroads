import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { apiRoute, unprocessable } from "@/server/api";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";

const subscription = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(200) }),
});

/** This device wants notifications: store (or move to this account) its push subscription. */
export const POST = apiRoute(async (req, user) => {
  const parsed = subscription.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return unprocessable("That didn't look like a notification subscription.");
  const s = parsed.data;
  await db.withUser(user.id, async (tx) => {
    // The same browser signed in as someone else before: endpoints are unique, so replace it.
    await tx.delete(t.pushSubscriptions).where(eq(t.pushSubscriptions.endpoint, s.endpoint));
    await tx.insert(t.pushSubscriptions).values({ userId: user.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null });
  });
  return NextResponse.json({ ok: true });
});

/** Notifications off on this device. */
export const DELETE = apiRoute(async (req, user) => {
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return unprocessable("Missing endpoint.");
  await db.withUser(user.id, (tx) => tx.delete(t.pushSubscriptions).where(and(eq(t.pushSubscriptions.endpoint, body.endpoint as string), eq(t.pushSubscriptions.userId, user.id))));
  return NextResponse.json({ ok: true });
});
