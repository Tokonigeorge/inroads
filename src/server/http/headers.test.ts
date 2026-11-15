import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

// Voice notes need the microphone: a Permissions-Policy of `microphone=()` blocks it for the whole
// site, so the browser never even asks (what Azeez hit). Camera and microphone stay limited to us.
describe("security headers", () => {
  it("lets our own pages ask for the microphone, and nothing else", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const policy = rules.flatMap((r) => r.headers).find((h) => h.key === "Permissions-Policy")?.value ?? "";
    expect(policy).toContain("microphone=(self)");
    expect(policy).toContain("geolocation=()");
  });
});
