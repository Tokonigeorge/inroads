/**
 * Test-only auth helpers. Signs ES256 JWTs the way Supabase Auth does, so the app's real
 * verification path (getClaims → JWKS → WebCrypto) runs unchanged in end-to-end tests.
 * This key exists only for tests and is not trusted anywhere else.
 */
import { createPrivateKey, createPublicKey, sign } from "node:crypto";

const PRIVATE_JWK = {"kty":"EC","x":"_DhfwH4WdEtMHcRMmIJOG1PB2SsdnSOYwVxM7V_2CWQ","y":"-bj7VQBMsIFurSQBYCOK2OQ7AURS-QwPyWDiU9lkJSs","crv":"P-256","d":"7fHxFp1v2JouSuKPZ8wvflnqCB75zdI22O23TLbC-j0"};
export const KID = "inroads-e2e";
export const FAKE_SUPABASE_PORT = 54399;
export const FAKE_SUPABASE_URL = `http://localhost:${FAKE_SUPABASE_PORT}`;

const privateKey = createPrivateKey({ key: PRIVATE_JWK, format: "jwk" });
export const publicJwk = { ...createPublicKey(privateKey).export({ format: "jwk" }), kid: KID, alg: "ES256", use: "sig", key_ops: ["verify"] };

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signJwt(payload: Record<string, unknown>) {
  const header = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: KID }));
  const body = b64url(JSON.stringify(payload));
  const sig = sign("sha256", Buffer.from(`${header}.${body}`), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${header}.${body}.${b64url(sig)}`;
}

/** The cookie @supabase/ssr reads: sb-<host>-auth-token = "base64-" + base64url(session JSON). */
export function sessionCookie(user: { id: string; email: string }) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 6 * 3600;
  const access_token = signJwt({
    sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now, exp,
    iss: `${FAKE_SUPABASE_URL}/auth/v1`, session_id: "e2e", is_anonymous: false,
  });
  const session = {
    access_token, refresh_token: "e2e-refresh", token_type: "bearer", expires_in: exp - now, expires_at: exp,
    user: { id: user.id, email: user.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
  return { name: "sb-localhost-auth-token", value: `base64-${b64url(JSON.stringify(session))}` };
}
