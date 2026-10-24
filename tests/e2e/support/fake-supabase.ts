/**
 * A stand-in for the few Supabase Auth endpoints the app calls server-side, and for Google
 * (OAuth, People, Calendar) under /google/<host><path>, which the app reaches through
 * TEST_FAKE_PROVIDERS_URL, and for the Anthropic API under /anthropic (ANTHROPIC_BASE_URL).
 * Started by Playwright's webServer. Not a security boundary; never
 * run outside tests.
 */
import { createServer } from "node:http";
import { handleFakeAnthropic } from "../../fixtures/fake-anthropic-http";
import { handleFakeGoogle } from "../../fixtures/fake-google";
import { FAKE_SUPABASE_PORT, publicJwk } from "./auth";

const lagosToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());

const json = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/anthropic/v1/messages" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    return handleFakeAnthropic(raw, res);
  }
  if (url.pathname.startsWith("/google/")) {
    const [host, ...rest] = url.pathname.slice("/google/".length).split("/");
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const r = handleFakeGoogle(req.method ?? "GET", host, `/${rest.join("/")}${url.search}`, new URLSearchParams(raw), lagosToday());
    if (r.redirect) {
      res.writeHead(r.status, { location: r.redirect });
      return res.end();
    }
    return json(res, r.status, r.json ?? {});
  }
  if (url.pathname === "/auth/v1/.well-known/jwks.json") return json(res, 200, { keys: [publicJwk] });
  if (url.pathname === "/auth/v1/logout") {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/health") return json(res, 200, { ok: true });
  return json(res, 400, { error: "not_supported_in_tests", path: url.pathname });
}).listen(FAKE_SUPABASE_PORT, () => console.log(`fake supabase on ${FAKE_SUPABASE_PORT}`));
