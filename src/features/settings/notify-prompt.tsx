"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";
import { Button } from "@/ui/button";
import { usePush } from "./use-push";

const KEY = "inroads:notify-prompt-hidden";
const noSubscribe = () => () => {};
const hiddenBefore = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * On Today, until notifications are on (or you say not now): what they're for, and one tap to
 * turn them on right here. The defaults (after meetings, a daily wrap-up at 18:00) can be changed
 * in Settings.
 */
export function NotifyPrompt({ publicKey, wrapUpTime }: { publicKey: string; wrapUpTime: string }) {
  const stored = useSyncExternalStore(noSubscribe, hiddenBefore, () => true);
  const { state, turnOn } = usePush(publicKey);
  const [hidden, setHidden] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  if (stored || hidden || state === "checking" || state === "unsupported" || (state === "on" && !done)) return null;
  const hide = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setHidden(true);
  };
  return (
    <section aria-label="Notifications" className="card mt-1.5 grid gap-2.5 p-3.5">
      {done ? (
        <>
          <h3>Notifications are on</h3>
          <p className="text-[14px] text-muted">
            You&apos;ll get a &ldquo;how did it go?&rdquo; when a meeting ends, and a wrap-up every day at {wrapUpTime}.{" "}
            <Link href="/settings#notifications" className="font-semibold text-accent hover:underline">
              Change when
            </Link>
          </p>
        </>
      ) : (
        <>
          <h3>Let Inroads nudge you</h3>
          <p className="text-[14px] text-muted">A quick &ldquo;how did it go?&rdquo; when a meeting ends, and a short wrap-up each evening, so you don&apos;t have to remember to log things.</p>
          {state === "ios-install" ? (
            <p className="text-[14px]">On iPhone, add Inroads to your Home Screen first (Safari: Share → Add to Home Screen), then open it from there.</p>
          ) : state === "denied" ? (
            <p className="text-[14px]">
              Notifications are blocked for Inroads. Allow them in your browser&apos;s site settings, then{" "}
              <Link href="/settings#notifications" className="font-semibold text-accent hover:underline">
                turn them on in Settings
              </Link>
              .
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {state === "off" ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    try {
                      if ((await turnOn()) === "on") setDone(true);
                    } catch {
                      setError("Couldn't turn them on. Try again in a moment.");
                    }
                  })
                }
              >
                Turn on notifications
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={hide}>
              Not now
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
