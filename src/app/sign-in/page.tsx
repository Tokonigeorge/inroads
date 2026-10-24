import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/features/auth/sign-in-form";
import { Logo } from "@/features/shell/logo";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center px-4 py-12">
      <div className="flex items-center gap-2 pb-10">
        <Logo size={24} />
        <span className="text-title font-semibold">Inroads</span>
      </div>
      <h1 className="font-display text-display font-medium">Sign in</h1>
      <p className="mt-2 mb-8 text-muted">
        Keep track of the people who matter to your goals, the rooms you&apos;re in and what you&apos;ve promised.
      </p>
      <Suspense fallback={<div className="h-12 rounded-md bg-sunken" />}>
        <SignInForm />
      </Suspense>
    </main>
  );
}
