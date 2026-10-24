import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_UPLOAD_BYTES, readImportFiles } from "@/importers/files";
import { apiRoute, unprocessable } from "@/server/api";
import { db } from "@/server/db/client";
import { stageFileImport } from "@/server/import/files";
import { listSpaces } from "@/server/repos/spaces";
import { userContext } from "@/server/user-context";

export const maxDuration = 60;

/**
 * Uploads contact and calendar files, parses them on the server and stages the result for
 * review. The files are read in memory and never stored.
 */
export const POST = apiRoute(async (req, user) => {
  const form = await req.formData().catch(() => null);
  if (!form) return unprocessable("Choose one or more files.");
  const spaceId = z.string().uuid().safeParse(form.get("spaceId"));
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return unprocessable("Choose one or more files.", "files");
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ ok: false, message: "That's more than 4 MB. Upload fewer files at a time, or unzip and choose just the contacts and calendar files." }, { status: 413 });
  }
  const result = await db.withUser(user.id, async (tx) => {
    const [spaces, ctx] = await Promise.all([listSpaces(tx), userContext(tx)]);
    const space = spaces.find((s) => s.id === (spaceId.success ? spaceId.data : "")) ?? spaces[0];
    if (!space) return null;
    const parsed = readImportFiles(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))), ctx.region);
    if (!parsed.contacts.length && !parsed.events.length) return { empty: parsed.errors };
    return stageFileImport(tx, { userId: user.id, spaceId: space.id, parsed });
  });
  if (!result) return unprocessable("Create a Space first.");
  if ("empty" in result) return unprocessable(result.empty[0] ?? "No contacts or calendar events were found in those files.", "files");
  return NextResponse.json({ ok: true, importId: result.importId });
});
