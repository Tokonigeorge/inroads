"use client";

import { createStore, del, entries, set } from "idb-keyval";
import type { Capture } from "@/contracts/people";

/**
 * The phone's outbox. Captures are sent straight away when there's a connection; otherwise
 * they wait here (IndexedDB) and are replayed in order when the connection returns. Each
 * capture has a client-generated id, so a replay after a timeout never duplicates anything.
 */

type Queued = { key: string; capture: Capture; queuedAt: number; attempts: number };
export type SendResult = { ok: true; id: string; queued: boolean } | { ok: false; message: string; field?: string };

const store = typeof indexedDB !== "undefined" ? createStore("inroads", "outbox") : undefined;
const listeners = new Set<() => void>();
let pending = 0;
let failed: { capture: Capture; message: string }[] = [];

function emit() {
  for (const l of listeners) l();
}

export function subscribeOutbox(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const outboxSnapshot = () => pending;
export const outboxFailures = () => failed;
export function clearOutboxFailures() {
  failed = [];
  emit();
}

async function refreshCount() {
  pending = store ? (await entries(store)).length : 0;
  emit();
}

async function post(capture: Capture): Promise<{ status: number; body: { ok: boolean; id?: string; message?: string; field?: string } }> {
  const res = await fetch("/api/v1/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(capture),
  });
  return { status: res.status, body: await res.json().catch(() => ({ ok: false })) };
}

const captureId = (c: Capture) => c.data.id;

/** Sends now, or queues for later when offline or the server is unreachable. */
export async function sendCapture(capture: Capture): Promise<SendResult> {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      const { status, body } = await post(capture);
      if (status === 200 && body.ok) return { ok: true, id: body.id ?? captureId(capture), queued: false };
      if (status === 422 || status === 400) return { ok: false, message: body.message ?? "That couldn't be saved.", field: body.field };
      if (status === 401) return { ok: false, message: body.message ?? "Sign in again to continue." };
      // 5xx: keep it and retry later.
    } catch {
      // Network error: fall through to the queue.
    }
  }
  if (!store) return { ok: false, message: "You're offline and this browser can't store changes. Try again when you're back online." };
  const key = `${Date.now().toString(36)}-${captureId(capture)}`;
  await set(key, { key, capture, queuedAt: Date.now(), attempts: 0 } satisfies Queued, store);
  await refreshCount();
  return { ok: true, id: captureId(capture), queued: true };
}

let flushing: Promise<number> | null = null;

/** Replays queued captures oldest first. Returns how many were saved. */
export function flushOutbox(): Promise<number> {
  if (!store || (typeof navigator !== "undefined" && !navigator.onLine)) return Promise.resolve(0);
  flushing ??= (async () => {
    let saved = 0;
    try {
      const items = (await entries<string, Queued>(store)).map(([, v]) => v).sort((a, b) => a.key.localeCompare(b.key));
      for (const item of items) {
        let status = 0;
        let body: { message?: string } = {};
        try {
          ({ status, body } = await post(item.capture));
        } catch {
          break; // still offline; try again later, keeping order
        }
        if (status === 200) {
          await del(item.key, store);
          saved++;
        } else if (status === 422 || status === 400) {
          await del(item.key, store);
          failed = [...failed, { capture: item.capture, message: body.message ?? "That couldn't be saved." }];
        } else {
          await set(item.key, { ...item, attempts: item.attempts + 1 }, store);
          break; // server trouble or signed out: keep the rest in order
        }
      }
    } finally {
      await refreshCount();
      flushing = null;
    }
    return saved;
  })();
  return flushing;
}

export async function initOutbox() {
  await refreshCount();
}
