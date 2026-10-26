"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const KEY = "inroads:locale-sent";

/** Sends this browser's time zone and language once, so reminders land on your day without a set-up step. */
export function DetectLocale() {
  const router = useRouter();
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) return;
      localStorage.setItem(KEY, "1");
    } catch {
      return;
    }
    fetch("/api/v1/profile/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, language: navigator.language }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((r: { updated?: boolean } | null) => {
        if (r?.updated) router.refresh();
      })
      .catch(() => undefined);
  }, [router]);
  return null;
}
