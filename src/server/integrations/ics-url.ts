import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Fetch } from "./http";

/**
 * Fetches a calendar subscription link (iCloud "public calendar", Outlook "publish", any .ics).
 * The URL comes from the user, so it's treated as hostile (SSRF): https only, every hop's
 * address must be public, at most 3 redirects, 10 MB and 15 seconds.
 */

export class IcsUrlError extends Error {}

const MAX_BYTES = 10 * 1024 * 1024;

export function normaliseIcsUrl(raw: string): URL {
  let v = raw.trim();
  if (/^webcals?:\/\//i.test(v)) v = v.replace(/^webcals?:\/\//i, "https://");
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new IcsUrlError("That doesn't look like a calendar link. It usually starts with webcal:// or https://.");
  }
  if (u.protocol !== "https:") throw new IcsUrlError("Use a secure link (https:// or webcal://).");
  if (u.username || u.password) throw new IcsUrlError("Links with a username or password aren't supported.");
  return u;
}

/** True for loopback, private, link-local, CGNAT, multicast and other non-public ranges. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

type Resolver = (host: string) => Promise<string[]>;
const dnsResolve: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

async function assertPublic(u: URL, resolve: Resolver) {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await resolve(host).catch(() => []);
  if (!addresses.length) throw new IcsUrlError("We couldn't find that server. Check the link.");
  if (addresses.some(isPrivateAddress)) throw new IcsUrlError("That link points to a private network address, so it can't be used.");
}

export async function fetchIcsUrl(raw: string, deps: { fetch?: Fetch; resolve?: Resolver; timeoutMs?: number } = {}): Promise<string> {
  const f = deps.fetch ?? fetch;
  const resolve = deps.resolve ?? dnsResolve;
  let u = normaliseIcsUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(u, resolve);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), deps.timeoutMs ?? 15_000);
    let res: Response;
    try {
      res = await f(u.toString(), { redirect: "manual", signal: ctl.signal, headers: { Accept: "text/calendar, text/plain;q=0.8" } });
    } catch {
      throw new IcsUrlError("The calendar didn't respond. Try again later.");
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      u = normaliseIcsUrl(new URL(res.headers.get("location")!, u).toString());
      continue;
    }
    if (res.status === 404 || res.status === 403) throw new IcsUrlError("That calendar link no longer works. It may have been unshared.");
    if (!res.ok) throw new IcsUrlError(`The calendar server returned an error (${res.status}).`);
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) throw new IcsUrlError("That calendar is too large to import (over 10 MB).");
    const reader = res.body?.getReader();
    if (!reader) return "";
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new IcsUrlError("That calendar is too large to import (over 10 MB).");
      }
      parts.push(value);
    }
    const text = new TextDecoder().decode(Buffer.concat(parts));
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new IcsUrlError("That link didn't return a calendar.");
    return text;
  }
  throw new IcsUrlError("That link redirects too many times.");
}
