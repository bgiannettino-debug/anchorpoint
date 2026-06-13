"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getAuthServerSnapshot,
  getAuthSnapshot,
  subscribeAuth,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/app/auth/actions";

/**
 * Header auth control. Client-rendered (reads the shared auth store) so the
 * root layout doesn't call cookies() — that would force every page to
 * render dynamically and defeat ISR caching on the catalog pages. The
 * signed-in state appears after hydration, like the other auth-gated
 * controls (bookmark/tick).
 */
export function AuthIndicator() {
  const auth = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthServerSnapshot,
  );
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch when signed in. (displayName isn't rendered while
    // signed-out/loading, so no synchronous reset is needed here.)
    if (auth.status !== "signed-in") return;
    let active = true;
    const supabase = createClient();
    void supabase
      .from("profiles")
      .select("display_name")
      .maybeSingle()
      .then(({ data }) => {
        if (active) setDisplayName(data?.display_name ?? null);
      });
    return () => {
      active = false;
    };
  }, [auth.status]);

  // Reserve the row height while the store resolves to avoid a layout jump.
  if (auth.status === "loading") {
    return <span className="ml-auto text-sm opacity-0" aria-hidden="true" />;
  }

  if (auth.status === "signed-out") {
    return (
      <Link
        href="/login"
        className="ml-auto text-sm text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
      >
        Sign in
      </Link>
    );
  }

  return (
    <>
      <Link
        href="/account"
        className="hidden sm:inline text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 truncate max-w-[24ch]"
      >
        {displayName || auth.email}
      </Link>
      <div className="ml-auto flex items-center gap-3 text-sm">
        <Link
          href="/bookmarks"
          className="text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
        >
          Bookmarks
        </Link>
        <Link
          href="/ticks"
          className="text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
        >
          Ticks
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
          >
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
