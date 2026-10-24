"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { OutboxSync } from "@/features/offline/outbox-sync";
import { ToastProvider } from "@/ui/toast";
import { CaptureProvider } from "./capture-sheet";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, gcTime: 10 * 60_000, retry: 1, refetchOnWindowFocus: false, networkMode: "offlineFirst" },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CaptureProvider>
          {children}
          <OutboxSync />
        </CaptureProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
