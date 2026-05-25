"use client";

import { useSyncExternalStore } from "react";
import {
  type Bookmark,
  getBookmarksServerSnapshot,
  getBookmarksSnapshot,
  subscribeBookmarks,
  toggleBookmark,
} from "@/lib/bookmarks";

type Props = Omit<Bookmark, "addedAt">;

export function BookmarkButton(props: Props) {
  const items = useSyncExternalStore(
    subscribeBookmarks,
    getBookmarksSnapshot,
    getBookmarksServerSnapshot,
  );
  const saved = items.some(
    (b) => b.type === props.type && b.uuid === props.uuid,
  );

  return (
    <button
      type="button"
      onClick={() => toggleBookmark(props)}
      aria-pressed={saved}
      className="shrink-0 text-sm px-3 py-1.5 rounded-full border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
    >
      {saved ? "★ Saved" : "☆ Save"}
    </button>
  );
}
