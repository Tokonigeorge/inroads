import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/inngest is called by Inngest itself, never a person; every request to it is checked against INNGEST_SIGNING_KEY.
const PUBLIC_PATHS = ["/sign-in", "/auth", "/offline", "/manifest.webmanifest", "/sw.js", "/icons", "/api/inngest"];

/**
 * Refreshes the Supabase session cookie on every request and sends signed-out visitors
 * to /sign-in. Pages still check the user themselves (see src/server/auth.ts); this is
 * the fast path, not the security boundary.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(`${p}/`));
  if (!url || !key) return isPublic ? NextResponse.next() : redirectToSignIn(request);

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims && !isPublic) return redirectToSignIn(request);
  return response;
}

function redirectToSignIn(request: NextRequest) {
  const to = request.nextUrl.clone();
  to.pathname = "/sign-in";
  to.search = "";
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/" && next !== "/sign-in") to.searchParams.set("next", next);
  return NextResponse.redirect(to);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico|txt)$).*)"],
};
