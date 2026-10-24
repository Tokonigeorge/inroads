import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser, safeNext } from "@/server/auth";
import { db } from "@/server/db/client";
import { completeOAuth, OAUTH_COOKIE, oauthClient, type OAuthProvider } from "@/server/integrations/oauth";
import { enqueueSync } from "@/server/jobs/enqueue";
import { listSpaces } from "@/server/repos/spaces";
import { connectionsStore } from "@/server/system/connections";

const cookieSchema = z.object({ state: z.string(), provider: z.enum(["google", "microsoft"]), spaceId: z.string(), back: z.string() });

/** Google/Microsoft send the user back here: save the account (tokens encrypted) and start the first sync. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/oauth/[provider]/callback">) {
  const { provider } = await ctx.params;
  const raw = request.cookies.get(OAUTH_COOKIE)?.value;
  const saved = raw ? cookieSchema.safeParse(JSON.parse(raw)) : null;
  const back = safeNext(saved?.success ? saved.data.back : null, "/settings/connections");
  const to = (params: Record<string, string>) => {
    const u = new URL(back, request.nextUrl.origin);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const res = NextResponse.redirect(u);
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/oauth" });
    return res;
  };

  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", request.nextUrl.origin));
  const q = request.nextUrl.searchParams;
  if (q.get("error")) return to({ error: q.get("error") === "access_denied" ? "denied" : "provider_error", provider });
  if (!saved?.success || saved.data.provider !== provider || saved.data.state !== q.get("state") || !q.get("code")) return to({ error: "state", provider });
  const client = oauthClient(provider as OAuthProvider);
  if (!client) return to({ error: "not_configured", provider });

  try {
    const result = await completeOAuth(provider as OAuthProvider, fetch, { ...client, code: q.get("code")!, redirectUri: `${request.nextUrl.origin}/api/oauth/${provider}/callback` });
    const spaces = await db.withUser(user.id, (tx) => listSpaces(tx));
    const spaceId = spaces.find((s) => s.id === saved.data.spaceId)?.id ?? spaces[0]?.id;
    if (!spaceId) return to({ error: "no_space", provider });
    const connectionId = await connectionsStore().upsert({
      userId: user.id,
      provider: provider as OAuthProvider,
      accountEmail: result.email,
      scopes: result.scopes,
      tokens: result.tokens,
      spaceId,
    });
    const jobId = await enqueueSync(user.id, connectionId, provider);
    return to({ job: jobId, connected: provider });
  } catch (e) {
    console.error("oauth callback", e);
    return to({ error: "provider_error", provider });
  }
}
