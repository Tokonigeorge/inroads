"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { syncStaleAction } from "./actions";

const KEY = "inroads:last-auto-sync";

/**
 * When the app opens (and at most every 10 minutes after), asks the server to sync any
 * connected account that's behind, then refreshes the page a little later so new meetings
 * and people appear.
 */
export function AutoSync() {
  const router = useRouter();
  useEffect(() => {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(KEY) ?? 0);
    } catch {}
    if (Date.now() - last < 10 * 60_000) return;
    try {
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {}
    let timer: ReturnType<typeof setTimeout> | undefined;
    syncStaleAction()
      .then((r) => {
        if (r.started) timer = setTimeout(() => router.refresh(), 45_000);
      })
      .catch(() => undefined);
    return () => clearTimeout(timer);
  }, [router]);
  return null;
}
