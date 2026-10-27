import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      { source: "/", destination: "/today", permanent: false },
      // No set-up wizard, as in the prototype: goals live in the Profile & goals sheet.
      { source: "/onboarding", has: [{ type: "query", key: "step", value: "goals" }], destination: "/goals?edit=profile", permanent: false },
      { source: "/onboarding", destination: "/today", permanent: false },
      // Look-ups moved to the Discover tab.
      { source: "/rooms/lookup", destination: "/discover", permanent: true },
      { source: "/rooms/lookup/:id", destination: "/discover/:id", permanent: true },
      // /people/[id] and /rooms/[id] open as sheets over the page you're on, so nothing else may
      // sit at that depth (an intercepted [id] would catch it).
      { source: "/people/triage", destination: "/sort", permanent: true },
      { source: "/people/duplicates", destination: "/duplicates", permanent: true },
      { source: "/people/ask", destination: "/ask", permanent: true },
      { source: "/people/suggestions", destination: "/suggestions", permanent: true },
      { source: "/rooms/suggested", destination: "/rooms#radar", permanent: true },
      { source: "/radar", destination: "/rooms#radar", permanent: true },
    ];
  },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
