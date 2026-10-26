import { NextResponse } from "next/server";
import { isAiConfigured } from "@/server/ai/config";
import { apiRoute } from "@/server/api";
import { db } from "@/server/db/client";
import { listSpaces } from "@/server/repos/spaces";
import { readSelectedSpaceId } from "@/server/space-selection";
import { userContext } from "@/server/user-context";

/** Active Spaces, the current selection and your time zone (for "today" in forms), for client-side capture forms. */
export const GET = apiRoute(async (_req, user) => {
  const [[spaces, ctx], selectedId] = await Promise.all([db.withUser(user.id, (tx) => Promise.all([listSpaces(tx), userContext(tx)])), readSelectedSpaceId()]);
  return NextResponse.json({
    spaces: spaces.map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
    selectedId: spaces.some((s) => s.id === selectedId) ? selectedId : null,
    aiEnabled: isAiConfigured(),
    timezone: ctx.timezone,
  });
});
