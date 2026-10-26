import { NextResponse } from "next/server";
import { apiRoute } from "@/server/api";
import { syncStale } from "@/server/sync/stale";

/** Opening the app: sync connected accounts that are behind. A plain request, not a server action, so it never holds up the page. */
export const POST = apiRoute(async (_req, user) => NextResponse.json({ started: await syncStale(user.id) }));
