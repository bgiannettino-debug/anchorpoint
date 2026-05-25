"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  getBookmarksServerSnapshot,
  getBookmarksSnapshot,
  subscribeBookmarks,
} from "@/lib/bookmarks";

const PREVIEW_LIMIT = 5;

export function BookmarksPreview() {
  const items = useSyncExternalStore(
    subscribeBookmarks,
    getBookmarksSnapshot,
    getBookmarksServerSnapshot,
  );

  if (items.length === 0) return null;

  const recent = [...items]
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, PREVIEW_LIMIT);

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200">
          Bookmarks
        </h2>
        <Link
          href="/bookmarks"
          className="text-sm text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
        >
          View all ({items.length})
        </Link>
      </div>
      <ul className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 divide-y divide-stone-200 dark:divide-stone-800">
        {recent.map((b) => (
          <li key={`${b.type}-${b.uuid}`}>
            <Link
              href={b.type === "area" ? `/area/${b.uuid}` : `/climb/${b.uuid}`}
              className="block px-6 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-stone-900 dark:text-stone-100">
                  {b.name}
                </span>
                <span className="text-xs text-stone-500 dark:text-stone-400 font-mono shrink-0">
                  {b.type === "climb" ? (b.grade ?? "Climb") : "Area"}
                </span>
              </div>
              {b.type === "climb" && b.parentName && (
                <div className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
                  {b.parentName}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
