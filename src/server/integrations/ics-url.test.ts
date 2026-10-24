import { describe, expect, it } from "vitest";
import { fetchIcsUrl, isPrivateAddress, normaliseIcsUrl } from "./ics-url";

const cal = "BEGIN:VCALENDAR\nEND:VCALENDAR";
const ok = (body = cal, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

describe("calendar links", () => {
  it("accepts webcal and https, rejects the rest", () => {
    expect(normaliseIcsUrl("webcal://p01-caldav.icloud.com/published/2/abc").toString()).toBe("https://p01-caldav.icloud.com/published/2/abc");
    expect(() => normaliseIcsUrl("http://example.com/cal.ics")).toThrow(/secure link/);
    expect(() => normaliseIcsUrl("file:///etc/passwd")).toThrow();
    expect(() => normaliseIcsUrl("https://user:pw@example.com/x")).toThrow(/username/);
  });

  it("knows private and special addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "17.253.144.10", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("refuses hosts that resolve to private addresses, including via redirects", async () => {
    await expect(fetchIcsUrl("https://evil.example/cal.ics", { resolve: async () => ["169.254.169.254"], fetch: async () => ok() })).rejects.toThrow(/private network/);
    const fetchRedirect = async (u: string) => (u.includes("public") ? new Response(null, { status: 302, headers: { location: "https://internal.example/x" } }) : ok());
    const resolve = async (h: string) => (h === "internal.example" ? ["10.0.0.5"] : ["93.184.216.34"]);
    await expect(fetchIcsUrl("https://public.example/cal.ics", { resolve, fetch: fetchRedirect })).rejects.toThrow(/private network/);
  });

  it("returns the calendar text from a public host, following safe redirects", async () => {
    const f = async (u: string) => (u.endsWith("/old") ? new Response(null, { status: 301, headers: { location: "/new" } }) : ok());
    expect(await fetchIcsUrl("https://cal.example/old", { resolve: async () => ["93.184.216.34"], fetch: f })).toBe(cal);
  });

  it("rejects non-calendars, dead links and huge files", async () => {
    const resolve = async () => ["93.184.216.34"];
    await expect(fetchIcsUrl("https://cal.example/x", { resolve, fetch: async () => ok("<html>") })).rejects.toThrow(/didn't return a calendar/);
    await expect(fetchIcsUrl("https://cal.example/x", { resolve, fetch: async () => new Response("", { status: 404 }) })).rejects.toThrow(/no longer works/);
    await expect(fetchIcsUrl("https://cal.example/x", { resolve, fetch: async () => ok(cal, { headers: { "content-length": String(20 * 1024 * 1024) } }) })).rejects.toThrow(/too large/);
  });
});
