"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { useToast } from "@/ui/toast";
import { clearOutboxFailures, flushOutbox, initOutbox, outboxFailures, outboxSnapshot, subscribeOutbox } from "./outbox";

export function usePendingCaptures() {
  return useSyncExternalStore(subscribeOutbox, outboxSnapshot, () => 0);
}

/** Replays the outbox on load, when the connection returns and every 30 seconds while items wait. */
export function OutboxSync() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const pending = usePendingCaptures();
  const failures = useSyncExternalStore(subscribeOutbox, outboxFailures, () => []);

  useEffect(() => {
    const flush = async () => {
      const saved = await flushOutbox();
      if (saved > 0) {
        toast.show(saved === 1 ? "1 change synced." : `${saved} changes synced.`);
        await queryClient.invalidateQueries();
        router.refresh();
      }
    };
    void initOutbox().then(flush);
    window.addEventListener("online", flush);
    const timer = setInterval(() => {
      if (outboxSnapshot() > 0) void flush();
    }, 30_000);
    return () => {
      window.removeEventListener("online", flush);
      clearInterval(timer);
    };
  }, [queryClient, router, toast]);

  useEffect(() => {
    if (!failures.length) return;
    toast.show(failures.length === 1 ? `One change couldn't be saved: ${failures[0].message}` : `${failures.length} changes couldn't be saved.`);
    clearOutboxFailures();
  }, [failures, toast]);

  if (!pending) return null;
  return (
    <p role="status" className="fixed top-2 left-1/2 z-40 -translate-x-1/2 rounded-md bg-text px-3 py-1.5 text-micro text-bg md:top-auto md:bottom-6 md:left-auto md:right-6 md:translate-x-0">
      {pending === 1 ? "1 change saved on this device, waiting to sync" : `${pending} changes saved on this device, waiting to sync`}
    </p>
  );
}
