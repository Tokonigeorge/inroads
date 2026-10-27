"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * "← Back": returns to the page you came from when you came from inside the app, otherwise
 * goes to `fallback` (so a shared link or a fresh tab still has somewhere to go).
 */
export function BackLink({ fallback, label = "Back" }: { fallback: string; label?: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      onClick={(e) => {
        const inApp = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin) && window.history.length > 1;
        if (!inApp) return;
        e.preventDefault();
        router.back();
      }}
      className="inline-flex items-center gap-1 pt-3 text-small font-semibold text-muted hover:text-ink"
    >
      <ArrowLeft size={14} aria-hidden /> {label}
    </Link>
  );
}
