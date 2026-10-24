import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, safeNext } from "@/server/auth";
import { authorizeUrl, newState, OAUTH_COOKIE, oauthClient, type OAuthProvider } from "@/server/integrations/oauth";

/** Starts connecting Google or Microsoft data (separate from signing in). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/oauth/[provider]/start">) {
  const { provider } = await ctx.params;
  const back = safeNext(request.nextUrl.searchParams.get("return"), "/settings/connections");
  const to = (params: Record<string, string>) => {
    const u = new URL(back, request.nextUrl.origin);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return NextResponse.redirect(u);
  };
  if (provider !== "google" && provider !== "microsoft") return to({ error: "unknown_provider" });
  if (!(await getSessionUser())) return NextResponse.redirect(new URL("/sign-in", request.nextUrl.origin));
  const client = oauthClient(provider as OAuthProvider);
  if (!client) return to({ error: "not_configured", provider });

  const state = newState();
  const spaceId = request.nextUrl.searchParams.get("space") ?? "";
  const redirectUri = `${request.nextUrl.origin}/api/oauth/${provider}/callback`;
  const res = NextResponse.redirect(authorizeUrl(provider as OAuthProvider, { clientId: client.clientId, redirectUri, state }));
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, provider, spaceId, back }), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/api/oauth",
    maxAge: 600,
  });
  return res;
}
