"use client";

import { useEffect } from "react";

/** The last resort, when even the app's frame failed. Plain styles: the app's CSS isn't loaded here. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("app error", error);
  }, [error]);
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, padding: 16, textAlign: "center" }}>
        <title>Inroads</title>
        <div style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: 22 }}>Inroads didn&apos;t load</h1>
          <p style={{ color: "#666" }}>Something went wrong on our side. Nothing you saved has been lost.</p>
          <button type="button" onClick={() => retry()} style={{ marginTop: 8, padding: "10px 16px", borderRadius: 999, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
