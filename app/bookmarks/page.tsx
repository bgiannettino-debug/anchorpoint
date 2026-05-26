"use client";

import { Fragment, useSyncExternalStore } from "react";
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

  // For each climb, find the closest bookmarked ancestor area (if any).
  // ancestorUuids is root-to-leaf, so we iterate from the end so the
  // most-specific match wins — e.g. if both "Red River Gorge" and
  // "Undertow Wall" are bookmarked, the climb nests under Undertow Wall.
  const areaIds = new Set(areas.map((a) => a.uuid));
  const climbsByAreaUuid = new Map<string, Bookmark[]>();
  const orphanClimbs: Bookmark[] = [];

  for (const climb of climbs) {
    const chain =
      climb.ancestorUuids ??
      (climb.parentUuid ? [climb.parentUuid] : []);
    let matched: string | null = null;
    for (let i = chain.length - 1; i >= 0; i--) {
      if (areaIds.has(chain[i])) {
        matched = chain[i];
        break;
      }
    }
    if (matched) {
      const list = climbsByAreaUuid.get(matched) ?? [];
      list.push(climb);
      climbsByAreaUuid.set(matched, list);
    } else {
      orphanClimbs.push(climb);
    }
  }

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
                  {areas.map((area) => {
                    const nested = climbsByAreaUuid.get(area.uuid) ?? [];
                    return (
                      <Fragment key={area.uuid}>
                        <BookmarkRow bookmark={area} />
                        {nested.map((climb) => (
                          <BookmarkRow
                            key={climb.uuid}
                            bookmark={climb}
                            indent
                          />
                        ))}
                      </Fragment>
                    );
                  })}
                </ul>
              </section>
            )}
            {orphanClimbs.length > 0 && (
              <section>
                <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-4">
                  Routes ({orphanClimbs.length})
                </h2>
                <ul className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 divide-y divide-stone-200 dark:divide-stone-800">
                  {orphanClimbs.map((climb) => (
                    <BookmarkRow key={climb.uuid} bookmark={climb} />
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

function BookmarkRow({
  bookmark: b,
  indent = false,
}: {
  bookmark: Bookmark;
  indent?: boolean;
}) {
  return (
    <li className="flex items-baseline">
      <Link
        href={b.type === "area" ? `/area/${b.uuid}` : `/climb/${b.uuid}`}
        className={`flex-1 block py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors ${
          indent ? "pl-12 pr-6" : "px-6"
        }`}
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-stone-900 dark:text-stone-100">{b.name}</span>
          {b.type === "climb" && b.grade && (
            <span className="text-sm text-stone-500 dark:text-stone-400 font-mono shrink-0">
              {b.grade}
            </span>
          )}
        </div>
        {b.type === "climb" && !indent && b.parentName && (
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
