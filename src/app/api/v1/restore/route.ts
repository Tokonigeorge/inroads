import { NextResponse } from "next/server";
import { apiRoute } from "@/server/api";
import { readBackup, restoreBackup, RestoreError } from "@/server/account/restore";
import { db } from "@/server/db/client";

export const maxDuration = 300;
const MAX_BYTES = 40 * 1024 * 1024;

/** Restore from backup: upload an Inroads export (.zip or inroads.json) or a prototype backup (.json). Only adds. */
export const POST = apiRoute(async (req, user) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, message: "Choose a backup file." }, { status: 422 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, message: "That file is too big to restore (40 MB at most)." }, { status: 422 });
  try {
    const backup = readBackup(new Uint8Array(await file.arrayBuffer()));
    const restored = await db.withUser(user.id, (tx) => restoreBackup(tx, user.id, backup));
    return NextResponse.json({ ok: true, restored });
  } catch (e) {
    if (e instanceof RestoreError) return NextResponse.json({ ok: false, message: e.message }, { status: 422 });
    throw e;
  }
});
