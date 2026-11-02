"use client";

import { useEffect, useState } from "react";

export type PushState = "checking" | "unsupported" | "ios-install" | "off" | "on" | "denied";

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** iPhone and iPad only allow web notifications for apps added to the Home Screen. */
function isIosBrowserTab() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && !window.matchMedia("(display-mode: standalone)").matches;
}

/** This device's push status, and turning it on or off. Shared by Settings and the Today card. */
export function usePush(publicKey: string) {
  const [state, setState] = useState<PushState>("checking");
  useEffect(() => {
    let live = true;
    const set = (s: PushState) => live && setState(s);
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) set(isIosBrowserTab() ? "ios-install" : "unsupported");
    else if (Notification.permission === "denied") set("denied");
    else
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => set(sub ? "on" : "off"))
        .catch(() => set("off"));
    return () => {
      live = false;
    };
  }, []);

  /** Asks the browser, subscribes, and tells the server. Returns the new state. */
  async function turnOn(): Promise<PushState> {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      const s = permission === "denied" ? "denied" : "off";
      setState(s);
      return s;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    const res = await fetch("/api/v1/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
    if (!res.ok) throw new Error(String(res.status));
    setState("on");
    return "on";
  }

  async function turnOff() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/v1/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
      await sub.unsubscribe().catch(() => undefined);
    }
    setState("off");
  }

  return { state, turnOn, turnOff };
}
