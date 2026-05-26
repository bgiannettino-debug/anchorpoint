"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (signInError) {
      setStatus("error");
      setError(signInError.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
      <div className="max-w-md mx-auto">
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
          We&apos;ll email you a one-time link to sign in. No password.
        </p>

        {status === "sent" ? (
          <div className="bg-white dark:bg-stone-900 rounded-lg p-6 border border-stone-200 dark:border-stone-800">
            <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
              Check your inbox
            </h2>
            <p className="text-stone-600 dark:text-stone-400">
              We sent a sign-in link to <strong>{email}</strong>. Click it
              from this device and you&apos;ll come back here signed in.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              disabled={status === "sending"}
              className="w-full px-4 py-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full px-6 py-3 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {status === "sending" ? "Sending…" : "Send sign-in link"}
            </button>
            {status === "error" && (
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
