import { NextResponse } from "next/server";
import { quickReadSchema } from "@/contracts/quick-capture";
import { apiRoute, unprocessable } from "@/server/api";
import { readQuickCapture } from "@/server/capture/quick";
import { db } from "@/server/db/client";
import { userContext } from "@/server/user-context";

/** Reads a quick-capture line into a draft for review. Saves nothing. */
export const POST = apiRoute(async (req, user) => {
  const parsed = quickReadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return unprocessable(parsed.error.issues[0]?.message ?? "Type what happened.");
  const result = await db.withUser(user.id, async (tx) => {
    const { today } = await userContext(tx);
    return readQuickCapture(tx, {}, user.id, { ...parsed.data, today });
  });
  return NextResponse.json({ ok: true, ...result });
});
