import { NextResponse } from "next/server";
import { apiRoute } from "@/server/api";
import { db } from "@/server/db/client";
import { listSpaces } from "@/server/repos/spaces";
import { readSelectedSpaceId } from "@/server/space-selection";

/** Active Spaces and the current selection, for client-side capture forms. */
export const GET = apiRoute(async (_req, user) => {
  const [spaces, selectedId] = await Promise.all([db.withUser(user.id, (tx) => listSpaces(tx)), readSelectedSpaceId()]);
  return NextResponse.json({
    spaces: spaces.map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
    selectedId: spaces.some((s) => s.id === selectedId) ? selectedId : null,
  });
});
