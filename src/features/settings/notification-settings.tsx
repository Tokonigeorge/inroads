"use client";

import { useState, useTransition } from "react";
import { wrapUpFrequencies, wrapUpFrequencyLabels } from "@/contracts/profile";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { saveNotifyPrefsAction, sendTestNotificationAction } from "./actions";
import { usePush } from "./use-push";

type Prefs = { afterMeetings: boolean; wrapUpEveryDays: number; wrapUpTime: string };
/**
 * Settings → Notifications: turn push on for this device, then choose the nudges. Push works in
 * Chrome, Edge and Firefox (phone and computer) and in Safari once Inroads is on the Home Screen.
 */
export function NotificationSettings({ configured, publicKey, prefs }: { configured: boolean; publicKey: string; prefs: Prefs }) {
  const toast = useToast();
  const { state, turnOn: on, turnOff: off } = usePush(publicKey);
  const [busy, start] = useTransition();
  const [v, setV] = useState(prefs);
  const [message, setMessage] = useState<string | null>(null);

  const turnOn = () =>
    start(async () => {
      setMessage(null);
      try {
        if ((await on()) === "on") toast.show("Notifications are on for this device.");
      } catch {
        setMessage("Couldn't turn notifications on. Try again in a moment.");
      }
    });
  const turnOff = () => start(off);

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
