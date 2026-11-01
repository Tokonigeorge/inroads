"use client";

import Link from "next/link";
import { useSyncExternalStore, useState } from "react";
import { Button } from "@/ui/button";

const KEY = "inroads:notify-prompt-hidden";
const noSubscribe = () => () => {};
const hiddenBefore = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** On Today, until notifications are on somewhere (or you say not now): what they're for, and a way there. */
export function NotifyPrompt() {
  const stored = useSyncExternalStore(noSubscribe, hiddenBefore, () => true);
  const [hidden, setHidden] = useState(false);
  if (stored || hidden) return null;
  return (
    <section aria-label="Notifications" className="card mt-1.5 grid gap-2.5 p-3.5">
      <h3>Let Inroads nudge you</h3>
      <p className="text-[14px] text-muted">A quick &ldquo;how did it go?&rdquo; when a meeting ends, and a wrap-up at a time you choose, so you don&apos;t have to remember to log things.</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="primary">
          <Link href="/settings#notifications">Set up notifications</Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            try {
              localStorage.setItem(KEY, "1");
            } catch {}
            setHidden(true);
          }}
        >
          Not now
        </Button>
      </div>
    </section>
  );
}
