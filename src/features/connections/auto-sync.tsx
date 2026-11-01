"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const KEY = "inroads:last-auto-sync";

/**
 * When the app opens or you come back to it (at most every 10 minutes), asks the server to sync any
 * connected account that's behind, then refreshes what's on screen as the sync lands, so new
 * meetings and people appear without a reload. The People list keeps its pages in a client
 * cache, so that's dropped too (a page refresh alone left new contacts out).
 */
export function AutoSync() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const update = () => {
      void queryClient.invalidateQueries({ queryKey: ["people"] });
      router.refresh();
    };
    const run = () => {
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(KEY) ?? 0);
      } catch {}
      if (Date.now() - last < 10 * 60_000) return;
      try {
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {}
      fetch("/api/v1/sync", { method: "POST" })
        .then((res) => (res.ok ? (res.json() as Promise<{ started: number }>) : { started: 0 }))
        .then((r) => {
          // Most syncs finish within a minute; a big first import can take a few.
          if (r.started) for (const ms of [30_000, 90_000, 240_000]) timers.push(setTimeout(update, ms));
        })
        .catch(() => undefined);
    };
    // On open, and again when you come back to the app (a phone app is rarely reopened from cold).
    const onVisible = () => document.visibilityState === "visible" && run();
    run();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      timers.forEach(clearTimeout);
    };
  }, [router, queryClient]);
  return null;
}
