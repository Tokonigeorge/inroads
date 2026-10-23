import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center gap-3 px-4">
      <h1 className="font-display text-display font-medium">You&apos;re offline</h1>
      <p className="text-muted">This page needs a connection. Anything you already opened is still available, and Inroads reconnects on its own.</p>
    </main>
  );
}
