"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  type Bookmark,
  getBookmarksServerSnapshot,
  getBookmarksSnapshot,
  isBookmarked,
  subscribeBookmarks,
  toggleBookmark,
} from "@/lib/bookmarks";
import {
  getAuthServerSnapshot,
  getAuthSnapshot,
  subscribeAuth,
} from "@/lib/auth";
import {
  removeAreaSnapshot,
  removeClimbSnapshot,
  saveAreaSnapshot,
  saveClimbSnapshot,
} from "@/lib/offline-cache";

type Props = Omit<Bookmark, "addedAt"> & {
  /**
   * Full server-rendered data for this area or climb. When provided,
   * bookmarking writes it to IndexedDB so the page can be served
   * offline; unbookmarking deletes the snapshot. Pages that don't have
   * the data available can omit this — bookmark metadata still saves
   * via Supabase as before.
   */
  snapshot?: unknown;
};

const PILL_CLASSES =
  "shrink-0 inline-flex items-center text-sm px-3 py-1.5 rounded-full border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors";

export function BookmarkButton(props: Props) {
  const auth = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthServerSnapshot,
  );

  if (auth.status === "loading") {
    // Reserve the same footprint so the layout doesn't jump on hydration.
    return (
      <span
        className={`${PILL_CLASSES} opacity-0`}
        aria-hidden="true"
      >
        ☆ Save
      </span>
    );
  }

  if (auth.status === "signed-out") {
    return (
      <Link href="/login" className={PILL_CLASSES}>
        Sign in to save
      </Link>
    );
  }

  return <BookmarkButtonSignedIn {...props} />;
}

function BookmarkButtonSignedIn(props: Props) {
  const items = useSyncExternalStore(
    subscribeBookmarks,
    getBookmarksSnapshot,
    getBookmarksServerSnapshot,
  );
  const saved = items.some(
    (b) => b.type === props.type && b.uuid === props.uuid,
  );

  async function handleClick() {
    // Decide the action BEFORE toggling — toggleBookmark flips the
    // state, and we need to know whether we're about to save or remove
    // so we can apply the matching IDB write.
    const willSave = !isBookmarked(props.type, props.uuid);

    await toggleBookmark(props);

    if (willSave && props.snapshot !== undefined) {
      if (props.type === "area") {
        await saveAreaSnapshot(props.uuid, props.snapshot);
      } else {
        await saveClimbSnapshot(props.uuid, props.snapshot);
      }
    } else if (!willSave) {
      if (props.type === "area") {
        await removeAreaSnapshot(props.uuid);
      } else {
        await removeClimbSnapshot(props.uuid);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      aria-pressed={saved}
      className={PILL_CLASSES}
    >
      {saved ? "★ Saved" : "☆ Save"}
    </button>
  );
}
