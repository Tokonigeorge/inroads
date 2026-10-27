"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/ui/button";

/**
 * A page that broke. People see a plain apology and a way on; the details go to the logs
 * (the server's own log has the cause, matched by `digest`).
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("page error", error);
  }, [error]);
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <div className="mx-auto grid w-full max-w-[560px] gap-3 px-4 py-16 text-center">
      <h1 className="font-display text-[24px] font-[680]">This page didn&apos;t load</h1>
      <p className="text-muted">Something went wrong on our side, not yours. Nothing you saved has been lost. Try again, or head back to Today.</p>
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Button variant="primary" onClick={() => retry()}>
          Try again
        </Button>
        <Button asChild>
          <Link href="/today">Go to Today</Link>
        </Button>
      </div>
      {digest ? <p className="pt-4 font-mono text-[11px] text-faint">Ref {digest}</p> : null}
    </div>
  );
}
