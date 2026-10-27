import "server-only";
import { randomBytes } from "node:crypto";
import { exchangeGoogleCode, googleAccountEmail, googleAuthUrl, GOOGLE_SCOPES } from "./google";

import type { Fetch } from "./http";
import { exchangeMicrosoftCode, microsoftAccountEmail, microsoftAuthUrl, MICROSOFT_SCOPES } from "./microsoft";

export type OAuthProvider = "google" | "microsoft";
export const OAUTH_COOKIE = "inroads-oauth";

export function oauthClient(provider: OAuthProvider, env = process.env) {
  const id = provider === "google" ? env.GOOGLE_CLIENT_ID : env.MICROSOFT_CLIENT_ID;
  const secret = provider === "google" ? env.GOOGLE_CLIENT_SECRET : env.MICROSOFT_CLIENT_SECRET;
  return id && secret ? { clientId: id, clientSecret: secret } : null;
}

export const isProviderConfigured = (provider: OAuthProvider) => oauthClient(provider) !== null;

export function newState() {
  return randomBytes(24).toString("base64url");
}

export function authorizeUrl(provider: OAuthProvider, opts: { clientId: string; redirectUri: string; state: string }) {
  return provider === "google" ? googleAuthUrl(opts) : microsoftAuthUrl(opts);
}

export async function completeOAuth(provider: OAuthProvider, f: Fetch, opts: { clientId: string; clientSecret: string; code: string; redirectUri: string }) {
  if (provider === "google") {
    const tokens = await exchangeGoogleCode(f, opts);
    // What was granted, not what was asked for: each scope is a separate checkbox on Google's screen.
    const granted = tokens.scope.split(/\s+/).filter(Boolean);
    return { tokens, email: await googleAccountEmail(f, tokens.access_token), scopes: granted.length ? granted : GOOGLE_SCOPES };
  }
  const tokens = await exchangeMicrosoftCode(f, opts);
  return { tokens, email: await microsoftAccountEmail(f, tokens.access_token), scopes: MICROSOFT_SCOPES };
}
