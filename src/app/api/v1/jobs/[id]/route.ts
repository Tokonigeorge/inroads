import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiRoute } from "@/server/api";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";

/** Progress of a background job, read under RLS (only the owner sees it). */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/jobs/[id]">) {
  const { id } = await ctx.params;
  return apiRoute(async (_req, user) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false }, { status: 404 });
    const [job] = await db.withUser(user.id, (tx) =>
      tx.select({ id: t.jobs.id, kind: t.jobs.kind, status: t.jobs.status, progress: t.jobs.progress, error: t.jobs.error, resultRef: t.jobs.resultRef }).from(t.jobs).where(eq(t.jobs.id, id)),
    );
    return job ? NextResponse.json(job) : NextResponse.json({ ok: false }, { status: 404 });
  })(req);
}
