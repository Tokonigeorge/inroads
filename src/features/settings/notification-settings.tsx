"use client";

import { useEffect, useState, useTransition } from "react";
import { wrapUpFrequencies, wrapUpFrequencyLabels } from "@/contracts/profile";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { saveNotifyPrefsAction, sendTestNotificationAction } from "./actions";

type Prefs = { afterMeetings: boolean; wrapUpEveryDays: number; wrapUpTime: string };
type State = "checking" | "unsupported" | "ios-install" | "off" | "on" | "denied";

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** iPhone and iPad only allow web notifications for apps added to the Home Screen. */
function isIosBrowserTab() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && !window.matchMedia("(display-mode: standalone)").matches;
}

/**
 * Settings → Notifications: turn push on for this device, then choose the nudges. Push works in
 * Chrome, Edge and Firefox (phone and computer) and in Safari once Inroads is on the Home Screen.
 */
export function NotificationSettings({ configured, publicKey, prefs }: { configured: boolean; publicKey: string; prefs: Prefs }) {
  const toast = useToast();
  const [state, setState] = useState<State>("checking");
  const [busy, start] = useTransition();
  const [v, setV] = useState(prefs);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const set = (s: State) => live && setState(s);
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      set(typeof navigator !== "undefined" && isIosBrowserTab() ? "ios-install" : "unsupported");
    } else if (Notification.permission === "denied") set("denied");
    else
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => set(sub ? "on" : "off"))
        .catch(() => set("off"));
    return () => {
      live = false;
    };
  }, []);

  const turnOn = () =>
    start(async () => {
      setMessage(null);
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
        const res = await fetch("/api/v1/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
        if (!res.ok) throw new Error(String(res.status));
        setState("on");
        toast.show("Notifications are on for this device.");
      } catch {
        setMessage("Couldn't turn notifications on. Try again in a moment.");
      }
    });

  const turnOff = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/v1/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
        await sub.unsubscribe().catch(() => undefined);
      }
      setState("off");
    });

  if (!configured) return <p className="text-muted">Notifications aren&apos;t set up on this server yet.</p>;

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        {state === "on" ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px]">On for this device.</span>
            <Button size="sm" disabled={busy} onClick={() => start(async () => toast.show((await sendTestNotificationAction()).sent ? "Sent. It should arrive in a few seconds." : "Nothing was sent. Turn notifications off and on again."))}>
              Send a test
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={turnOff}>
              Turn off here
            </Button>
          </div>
        ) : state === "off" ? (
          <div>
            <Button variant="primary" disabled={busy} onClick={turnOn}>
              Turn on notifications
            </Button>
          </div>
        ) : state === "denied" ? (
          <p className="text-[14px]">
            Notifications are blocked for Inroads in this browser. To allow them: in Chrome, tap the icon left of the address, then <strong>Permissions → Notifications → Allow</strong>. In the installed app on Android: long-press its icon, <strong>App info → Notifications</strong>. Then come back here.
          </p>
        ) : state === "ios-install" ? (
          <p className="text-[14px]">On iPhone, add Inroads to your Home Screen first (Safari: Share → Add to Home Screen), open it from there, then turn notifications on here.</p>
        ) : state === "unsupported" ? (
          <p className="text-[14px] text-muted">This browser can&apos;t show notifications. Chrome on Android or a computer works.</p>
        ) : null}
        {message ? (
          <p role="alert" className="text-small text-danger">
            {message}
          </p>
        ) : null}
      </div>

      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveNotifyPrefsAction(v);
            if (r.ok) toast.show("Saved.");
            else setMessage(r.message ?? "Couldn't save that.");
          });
        }}
      >
        <label className="flex items-start gap-2.5 text-[14.5px]">
          <input type="checkbox" checked={v.afterMeetings} onChange={(e) => setV({ ...v, afterMeetings: e.target.checked })} className="mt-1 accent-[var(--accent)]" />
          <span>
            <span className="font-[550]">After a meeting ends, ask how it went</span>
            <span className="block text-small text-muted">For meetings from your calendar. One tap opens &ldquo;Who did you meet?&rdquo; for it.</span>
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Wrap-up" hint="A short nudge with what's on today and a prompt to note anything worth keeping.">
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} value={String(v.wrapUpEveryDays)} onChange={(e) => setV({ ...v, wrapUpEveryDays: Number(e.target.value) })}>
                {wrapUpFrequencies.map((f) => (
                  <option key={f} value={f}>
                    {wrapUpFrequencyLabels[f]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="At">
            {({ id }) => <Input id={id} type="time" value={v.wrapUpTime} disabled={v.wrapUpEveryDays === 0} onChange={(e) => setV({ ...v, wrapUpTime: e.target.value || "18:00" })} className="w-auto" />}
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={busy}>
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}
