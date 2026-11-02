import { NextResponse } from "next/server";
import { apiRoute } from "@/server/api";
import { syncStale } from "@/server/sync/stale";

/** Opening the app: sync connected accounts that are behind. A plain request, not a server action, so it never holds up the page. */
export const POST = apiRoute(async (_req, user) => {
  const jobIds = await syncStale(user.id);
  return NextResponse.json({ started: jobIds.length, jobIds });
});
