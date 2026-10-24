import { NextResponse } from "next/server";
import { peopleQuerySchema } from "@/contracts/people";
import { apiRoute, unprocessable } from "@/server/api";
import { db } from "@/server/db/client";
import { listPeople } from "@/server/repos/people";
import { userContext } from "@/server/user-context";

/** GET /api/v1/people?q=&spaceId=&filter=&tag=&circleId=&sort=&cursor=&limit= */
export const GET = apiRoute(async (req, user) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = peopleQuerySchema.safeParse({ ...params, spaceId: params.spaceId || null });
  if (!parsed.success) return unprocessable("That search couldn't be read.");
  const page = await db.withUser(user.id, async (tx) => listPeople(tx, parsed.data, (await userContext(tx)).today));
  return NextResponse.json(page);
});
