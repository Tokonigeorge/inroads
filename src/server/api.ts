import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/server/auth";

/** JSON route handler wrapper: signed-in users only, no caching, errors as JSON. */
export function apiRoute(handler: (req: Request, user: SessionUser) => Promise<Response>) {
  return async (req: Request) => {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, message: "Sign in again to continue." }, { status: 401 });
    try {
      const res = await handler(req, user);
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    } catch (e) {
      console.error(e);
      return NextResponse.json({ ok: false, message: "Something went wrong on our side. Try again." }, { status: 500 });
    }
  };
}

export const unprocessable = (message: string, field?: string) => NextResponse.json({ ok: false, message, field }, { status: 422 });
