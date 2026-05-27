"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      // We still pass emailRedirectTo so the clickable link in the
      // email also works as a fallback — useful if the user wants
      // the one-click magic-link experience instead of typing the code.
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
    } else {
      setStep("code");
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    if (verifyError) {
      setBusy(false);
      setError(verifyError.message);
      return;
    }
    // Cookies are set by the SSR client; navigate home and refresh so
    // the server-rendered AuthIndicator picks up the new session.
    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
      <div className="max-w-sm mx-auto">
        <Link
          href="/"
          className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
        >
          ← Home
        </Link>

        <h1 className="text-4xl font-bold text-stone-900 dark:text-stone-100 mt-6 mb-2">
          Sign in
        </h1>
        <p className="text-stone-600 dark:text-stone-400 mb-8">
          {step === "email"
            ? "We'll email you a code (or link) to sign in. No password."
            : `We sent a code to ${email}. Enter it below, or click the link in the email.`}
        </p>

        {step === "email" ? (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              disabled={busy}
              className="w-full px-4 py-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full px-6 py-3 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {busy ? "Sending…" : "Send sign-in code"}
            </button>
            {error && (
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            )}
          </form>
        ) : (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <input
              type="text"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              // Supabase OTP length is configurable (default 6, can be
              // raised to 8 or 10). Accept the whole range so the UI
              // doesn't reject a perfectly valid code.
              pattern="\d{6,10}"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="Enter the code"
              aria-label="Sign-in code"
              disabled={busy}
              className="w-full px-4 py-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent disabled:opacity-60 text-center tracking-[0.3em] text-lg font-mono"
            />
            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="w-full px-6 py-3 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {busy ? "Verifying…" : "Verify code"}
            </button>
            {error && (
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            )}
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
              }}
              disabled={busy}
              className="block text-sm text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-60"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
