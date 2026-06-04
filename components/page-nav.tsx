"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Top-of-page navigation: "←  Search". The back arrow steps one page
 * back through history (so you return to wherever you came from — a
 * parent area, search results, bookmarks — without "starting over");
 * the Search link jumps home. Replaces the lone "← Search" / "←
 * <parent>" link on the area + climb pages.
 *
 * Client component because Back is a history action. If we landed here
 * directly (a shared link, no in-app history), Back falls back to
 * Search so it's never a dead end.
 *
 * (No in-page Forward control: forward navigation is suppressed when
 * triggered from a click handler in this setup, and the browser's own
 * forward button covers that rare case anyway.)
 */
export function PageNav() {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length <= 1) {
      router.push("/");
    } else {
      window.history.back();
    }
  }

  return (
    <nav
      aria-label="Page navigation"
      className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400"
    >
      <button
        type="button"
        onClick={goBack}
        aria-label="Go back a page"
        className="inline-flex items-center justify-center w-7 h-7 -my-1 -ml-1 rounded text-base hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800/60 transition-colors"
      >
        ←
      </button>
      <Link
        href="/"
        className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
      >
        Search
      </Link>
    </nav>
  );
}
