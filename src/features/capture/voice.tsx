"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/ui/button";

/**
 * Voice debrief through the browser's own speech recognition (DECISIONS #91): no audio is sent
 * to Inroads, only the text you then review and save. Chrome (Android and desktop) and Safari
 * support it; elsewhere the button doesn't show and you type instead.
 */

type Alternative = { transcript: string };
type ResultList = ArrayLike<ArrayLike<Alternative> & { isFinal: boolean }>;
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | undefined => {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
const noSubscribe = () => () => {};
export const useVoiceSupported = () => useSyncExternalStore(noSubscribe, () => Boolean(ctor()), () => false);

const MAX_MS = 90_000;
const errors: Record<string, string> = {
  "not-allowed": "The microphone is blocked for Inroads.",
  busy: "The microphone is busy: a call or another app is using it. Try again when that's finished, or type it instead.",
  "service-not-allowed": "This browser won't do speech-to-text here. Chrome on Android or a computer works; or type instead.",
  "no-speech": "Didn't catch anything. Try again a little closer to the microphone.",
  "audio-capture": "No microphone was found. Type instead.",
  network: "Voice needs a connection in this browser. Type instead, or try again when you're online.",
};

const installed = () => typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches;
/** How to allow it again, for where Inroads is open. */
const howToAllow = () =>
  installed()
    ? "To allow it: long-press the Inroads icon, then App info → Permissions → Microphone → Allow. Or type it instead."
    : "To allow it: tap the icon left of the address bar, then Permissions → Microphone → Allow. Or type it instead.";

/**
 * "Blocked" from the browser doesn't always mean you said no: during a phone call the microphone is
 * in use, and Chrome reports that the same way. Ask the browser whether permission was given.
 */
async function blockedOrBusy(): Promise<string> {
  try {
    const p = await navigator.permissions?.query({ name: "microphone" as PermissionName });
    if (p?.state === "granted") return errors.busy;
  } catch {
    // No Permissions API for the microphone (Safari): say both.
    return `The microphone isn't available. If you're on a call, try again after it. ${howToAllow()}`;
  }
  return `${errors["not-allowed"]} ${howToAllow()}`;
}

/** Record → live transcript → `onDone(text)` when you stop. */
export function VoiceButton({ onText, onDone, disabled }: { onText: (text: string) => void; onDone: (text: string) => void; disabled?: boolean }) {
  const supported = useVoiceSupported();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const finalText = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => rec.current?.abort(), []);
  if (!supported) return null;

  /** Ask for the microphone first, so the browser shows its usual "Allow microphone?" prompt. */
  async function askThenStart() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
      stream?.getTracks().forEach((t) => t.stop());
    } catch (e) {
      const name = (e as { name?: string }).name;
      // In use (a call): say so. Blocked: say how to allow it. Anything else: let speech recognition try and report.
      if (name === "NotReadableError" || name === "AbortError") return setError(errors.busy);
      if (name === "NotAllowedError" || name === "SecurityError") return setError(await blockedOrBusy());
    }
    start();
  }

  function start() {
    const Ctor = ctor();
    if (!Ctor) return;
    setError(null);
    finalText.current = "";
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-GB";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0]?.transcript ?? "";
        if (e.results[i].isFinal) finalText.current = `${finalText.current} ${text}`.trim();
        else interim += text;
      }
      onText(`${finalText.current} ${interim}`.trim());
    };
    r.onerror = (e) => {
      if (e.error === "aborted") return;
      if (e.error === "not-allowed") return void blockedOrBusy().then(setError);
      setError(errors[e.error] ?? "Voice didn't work this time. Type instead.");
    };
    r.onend = () => {
      setListening(false);
      if (timer.current) clearTimeout(timer.current);
      rec.current = null;
      const text = finalText.current.trim();
      if (text) onDone(text);
    };
    rec.current = r;
    r.start();
    setListening(true);
    timer.current = setTimeout(() => r.stop(), MAX_MS);
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {listening ? (
          <Button onClick={() => rec.current?.stop()}>
            <Square size={14} aria-hidden /> Stop
          </Button>
        ) : (
          <Button onClick={() => void askThenStart()} disabled={disabled}>
            <Mic size={16} aria-hidden /> Record a voice note
          </Button>
        )}
        {listening ? (
          <p role="status" className="flex items-center gap-2 text-small text-muted">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-danger motion-reduce:animate-none" aria-hidden />
            Listening. Say who you met and what you promised, then press Stop.
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : (
        <p className="text-small text-muted">Your browser turns speech into text (Chrome uses Google for this). Inroads only keeps what you save.</p>
      )}
    </div>
  );
}
