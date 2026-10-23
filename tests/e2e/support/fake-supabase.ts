/**
 * A stand-in for the few Supabase Auth endpoints the app calls server-side. Started by
 * Playwright's webServer. Not a security boundary; never run outside tests.
 */
import { createServer } from "node:http";
import { FAKE_SUPABASE_PORT, publicJwk } from "./auth";

const json = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/auth/v1/.well-known/jwks.json") return json(res, 200, { keys: [publicJwk] });
  if (url.pathname === "/auth/v1/logout") {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/health") return json(res, 200, { ok: true });
  return json(res, 400, { error: "not_supported_in_tests", path: url.pathname });
}).listen(FAKE_SUPABASE_PORT, () => console.log(`fake supabase on ${FAKE_SUPABASE_PORT}`));
