import { NextResponse } from "next/server";
import { captureSchema } from "@/contracts/people";
import { autoResearch } from "@/server/ai/auto-research";
import { apiRoute, unprocessable } from "@/server/api";
import { db } from "@/server/db/client";
import { addPromise, createPerson, logTouch, setPromiseDone } from "@/server/repos/people";
import { userContext } from "@/server/user-context";

/**
 * Quick capture: add a person, log a touch, add a promise, mark a promise done. Every payload
 * carries a client-generated id, so the phone can queue these offline and replay them safely.
 */
export const POST = apiRoute(async (req, user) => {
  const parsed = captureSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return unprocessable(parsed.error.issues[0]?.message ?? "That couldn't be saved.");
  const c = parsed.data;
  const result = await db.withUser(user.id, async (tx) => {
    const { today } = await userContext(tx);
    switch (c.kind) {
      case "person":
        return createPerson(tx, user.id, c.data, today);
      case "touch":
        return logTouch(tx, user.id, c.data);
      case "promise":
        return addPromise(tx, user.id, c.data);
      case "promise_done":
        await setPromiseDone(tx, c.data.id, c.data.done);
        return { ok: true as const, data: { id: c.data.id } };
    }
  });
  if (!result.ok) return unprocessable(result.message, result.field);
  // Someone new, added by hand: research them now (a replayed offline capture isn't new).
  if (c.kind === "person" && result.data && "created" in result.data && result.data.created) await autoResearch(user.id, c.data.id, c.data.membership.spaceId);
  return NextResponse.json({ ok: true, id: result.data.id });
});
