"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  type Bookmark,
  getBookmarksServerSnapshot,
  getBookmarksSnapshot,
  removeBookmark,
  subscribeBookmarks,
} from "@/lib/bookmarks";

export default function BookmarksPage() {
  const items = useSyncExternalStore(
    subscribeBookmarks,
    getBookmarksSnapshot,
    getBookmarksServerSnapshot,
  );

  const areas = items
    .filter((b) => b.type === "area")
    .sort((a, b) => b.addedAt - a.addedAt);
  const climbs = items
    .filter((b) => b.type === "climb")
    .sort((a, b) => b.addedAt - a.addedAt);

  return (
    <main className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/"
          className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
        >
          ← Home
        </Link>

        <h1 className="text-4xl font-bold text-stone-900 dark:text-stone-100 mt-6 mb-8">
          Bookmarks
        </h1>

        {items.length === 0 ? (
          <p className="text-stone-500 dark:text-stone-400">
            You haven&apos;t bookmarked anything yet. Open an area or climb
            and click the Save button.
          </p>
        ) : (
          <>
            {areas.length > 0 && (
              <section className="mb-10">
                <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-4">
                  Areas ({areas.length})
                </h2>
                <ul className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 divide-y divide-stone-200 dark:divide-stone-800">
                  {areas.map((b) => (
                    <BookmarkRow key={b.uuid} bookmark={b} />
                  ))}
                </ul>
              </section>
            )}
            {climbs.length > 0 && (
              <section>
                <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-4">
                  Climbs ({climbs.length})
                </h2>
                <ul className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 divide-y divide-stone-200 dark:divide-stone-800">
                  {climbs.map((b) => (
                    <BookmarkRow key={b.uuid} bookmark={b} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function BookmarkRow({ bookmark: b }: { bookmark: Bookmark }) {
  return (
    <li className="flex items-baseline">
      <Link
        href={b.type === "area" ? `/area/${b.uuid}` : `/climb/${b.uuid}`}
        className="flex-1 block px-6 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-stone-900 dark:text-stone-100">{b.name}</span>
          {b.type === "climb" && b.grade && (
            <span className="text-sm text-stone-500 dark:text-stone-400 font-mono shrink-0">
              {b.grade}
            </span>
          )}
        </div>
        {b.type === "climb" && b.parentName && (
          <div className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
            {b.parentName}
          </div>
        )}
      </Link>
      <button
        type="button"
        onClick={() => removeBookmark(b.type, b.uuid)}
        aria-label={`Remove ${b.name} from bookmarks`}
        className="px-4 py-3 text-sm text-stone-500 dark:text-stone-400 hover:text-red-700 dark:hover:text-red-400 transition-colors"
      >
        Remove
      </button>
    </li>
  );
}
