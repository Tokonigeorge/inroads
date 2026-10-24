import { NextResponse } from "next/server";
import { apiRoute } from "@/server/api";
import { readExport } from "@/server/account/export";
import { db } from "@/server/db/client";

/** Downloads a data export. Read under RLS, so only its owner, signed in, can fetch it. */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/exports/[id]">) {
  const { id } = await ctx.params;
  return apiRoute(async (_req, user) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false }, { status: 404 });
    const row = await db.withUser(user.id, (tx) => readExport(tx, id));
    if (!row) return NextResponse.json({ ok: false, message: "That export has expired. Make a new one." }, { status: 404 });
    return new Response(new Uint8Array(row.data), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${row.filename}"`,
        "Content-Length": String(row.sizeBytes),
        "Cache-Control": "private, no-store",
      },
    });
  })(req);
}
