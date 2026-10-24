import { NextResponse, type NextRequest } from "next/server";
import { MAX_UPLOAD_BYTES, readImportFiles } from "@/importers/files";
import { getSessionUser } from "@/server/auth";
import { db } from "@/server/db/client";
import { stageFileImport } from "@/server/import/files";
import { stageShare } from "@/server/repos/share";
import { listSpaces } from "@/server/repos/spaces";
import { readSelectedSpaceId } from "@/server/space-selection";
import { userContext } from "@/server/user-context";

export const maxDuration = 60;

const to = (req: NextRequest, path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin), { status: 303 });

/**
 * The PWA share target (see app/manifest.ts). Contact and calendar files go to the usual import
 * review; links and text wait as a share to review. Nothing is saved to your people until you
 * confirm it.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return to(req, "/sign-in?error=share");
  const form = await req.formData().catch(() => null);
  if (!form) return to(req, "/today");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const selected = await readSelectedSpaceId();

  const target = await db.withUser(user.id, async (tx) => {
    const spaces = await listSpaces(tx);
    const space = spaces.find((s) => s.id === selected) ?? spaces[0];
    if (!space) return "/today";
    if (files.length) {
      if (files.reduce((n, f) => n + f.size, 0) > MAX_UPLOAD_BYTES) return "/settings/connections?error=share_too_big";
      const ctx = await userContext(tx);
      const parsed = readImportFiles(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))), ctx.region);
      if (!parsed.contacts.length && !parsed.events.length) return "/settings/connections?error=share_unreadable";
      const staged = await stageFileImport(tx, { userId: user.id, spaceId: space.id, parsed });
      return `/settings/imports/${staged.importId}`;
    }
    const input = { title: form.get("title") as string | null, text: form.get("text") as string | null, url: form.get("url") as string | null };
    if (![input.title, input.text, input.url].some((v) => typeof v === "string" && v.trim())) return "/today";
    return `/share/${await stageShare(tx, user.id, space.id, input)}`;
  });
  return to(req, target);
}

/** Opening /share directly (or an old link) just goes to Today. */
export function GET(req: NextRequest) {
  return to(req, "/today");
}
