"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { clientEnv } from "@/env.client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";

const errors: Record<string, string> = {
  callback: "Google sign-in didn't finish. Try again.",
  link: "That sign-in link has expired or was already used. Ask for a new one.",
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function SignInForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/today";
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [message, setMessage] = useState<string | null>(errors[params.get("error") ?? ""] ?? null);
  const [sent, setSent] = useState(false);
  const deleted = params.get("deleted") === "1";
  const configured = Boolean(clientEnv);

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    setBusy("google");
    setMessage(null);
    const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo(), queryParams: { prompt: "select_account" } },
    });
    if (error) {
      setBusy(null);
      setMessage("Couldn't reach Google. Check your connection and try again.");
    }
  }

  async function email(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const address = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setMessage("Enter a full email address, like name@example.com.");
      return;
    }
    setBusy("email");
    const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: redirectTo() },
    });
    setBusy(null);
    if (error) setMessage("Couldn't send the link. Try again in a minute.");
    else setSent(true);
  }

  return (
    <div className="grid gap-6">
      <Button variant="primary" size="lg" onClick={google} disabled={!configured || busy !== null}>
        <GoogleMark />
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </Button>

      {clientEnv?.magicLinkEnabled ? (
        sent ? (
          <p className="text-muted">Check your email for a sign-in link. It works once and expires in an hour.</p>
        ) : (
          <form onSubmit={email} className="grid gap-3" noValidate>
            <Field label="Or sign in with email">
              {({ id, describedBy }) => <Input id={id} name="email" type="email" autoComplete="email" inputMode="email" placeholder="name@example.com" aria-describedby={describedBy} />}
            </Field>
            <Button type="submit" disabled={busy !== null}>
              {busy === "email" ? "Sending…" : "Email me a sign-in link"}
            </Button>
          </form>
        )
      ) : null}

      {deleted ? (
        <p role="status" className="text-small text-muted">
          Your account and everything in it has been deleted.
        </p>
      ) : null}
      {!configured ? <p className="text-small text-danger">Sign-in isn&apos;t configured on this server yet.</p> : null}
      {message ? (
        <p role="alert" className="text-small text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
