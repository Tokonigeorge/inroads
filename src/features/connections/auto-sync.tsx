"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const KEY = "inroads:last-auto-sync";

/**
 * When the app opens or you come back to it (at most every 10 minutes), asks the server to sync any
 * connected account that's behind, follows those syncs, and refreshes what's on screen once, only
 * if one brought something in (most find nothing new). The People list keeps its pages in a
 * client cache, so that's dropped too (a page refresh alone left new contacts out).
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
        .then((res) => (res.ok ? (res.json() as Promise<{ jobIds?: string[] }>) : { jobIds: [] }))
        .then(({ jobIds = [] }) => {
          // Check each sync every 10 seconds for up to 5 minutes (a big first import can take a few).
          let changed = false;
          let open = jobIds.length;
          for (const id of jobIds) {
            let tries = 0;
            const check = () =>
              fetch(`/api/v1/jobs/${id}`, { cache: "no-store" })
                .then((r) => (r.ok ? (r.json() as Promise<{ status: string; progress?: { summary?: { unchanged?: boolean } } }>) : null))
                .then((job) => {
                  const finished = !job || job.status === "done" || job.status === "failed" || ++tries >= 30;
                  if (job?.status === "done" && !job.progress?.summary?.unchanged) changed = true;
                  if (!finished) return void timers.push(setTimeout(check, 10_000));
                  if (--open === 0 && changed) update();
                })
                .catch(() => (--open === 0 && changed ? update() : undefined));
            timers.push(setTimeout(check, 5_000));
          }
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
