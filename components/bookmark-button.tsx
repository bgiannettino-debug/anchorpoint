"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  addBookmark,
  type Bookmark,
  type BookmarkStatus,
  type NewBookmark,
  getBookmarksServerSnapshot,
  getBookmarksSnapshot,
  recordAttempt,
  removeBookmark,
  setBookmarkStatus,
  subscribeBookmarks,
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

type Props = NewBookmark & {
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
  "shrink-0 inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-full border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors";

// Label + leading glyph for each status. Kept in one place so the
// button, menu, and bookmarks page can share them.
export const STATUS_LABELS: Record<BookmarkStatus, string> = {
  bookmark: "★ Saved",
  project: "▶ Project",
  wishlist: "○ Wishlist",
};

export function BookmarkButton(props: Props) {
  const auth = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthServerSnapshot,
  );

  if (auth.status === "loading") {
    // Reserve the same footprint so the layout doesn't jump on hydration.
    return (
      <span className={`${PILL_CLASSES} opacity-0`} aria-hidden="true">
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
  const found = items.find(
    (b) => b.type === props.type && b.uuid === props.uuid,
  );

  async function handleAdd() {
    await addBookmark(props);
    if (props.snapshot === undefined) return;
    if (props.type === "area") {
      await saveAreaSnapshot(props.uuid, props.snapshot);
    } else {
      await saveClimbSnapshot(props.uuid, props.snapshot);
    }
  }

  async function handleRemove() {
    await removeBookmark(props.type, props.uuid);
    if (props.type === "area") await removeAreaSnapshot(props.uuid);
    else await removeClimbSnapshot(props.uuid);
  }

  if (!found) {
    return (
      <button
        type="button"
        onClick={() => void handleAdd()}
        aria-pressed={false}
        className={PILL_CLASSES}
      >
        ☆ Save
      </button>
    );
  }

  return (
    <SavedMenu
      bookmark={found}
      onChangeStatus={(s) => void setBookmarkStatus(found.type, found.uuid, s)}
      onRecordAttempt={() => void recordAttempt(found.type, found.uuid)}
      onRemove={() => void handleRemove()}
    />
  );
}

function SavedMenu({
  bookmark,
  onChangeStatus,
  onRecordAttempt,
  onRemove,
}: {
  bookmark: Bookmark;
  onChangeStatus: (s: BookmarkStatus) => void;
  onRecordAttempt: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the menu on clicks anywhere outside it, including taps that
  // land on a different status's button on the same page.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const isProjectClimb =
    bookmark.status === "project" && bookmark.type === "climb";

  return (
    <span ref={ref} className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={PILL_CLASSES}
      >
        <span>{STATUS_LABELS[bookmark.status]}</span>
        <span aria-hidden className="text-stone-400 dark:text-stone-500">
          ▾
        </span>
      </button>
      {/* Quick "I tried it" button shown inline only for project-status
          climbs. Areas don't get this — "attempt" is per-route. */}
      {isProjectClimb && (
        <button
          type="button"
          onClick={onRecordAttempt}
          className={PILL_CLASSES}
          title={
            bookmark.lastAttemptAt
              ? `Last attempt ${formatRelative(bookmark.lastAttemptAt)}`
              : undefined
          }
        >
          Mark attempt
        </button>
      )}
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 mt-1 w-44 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-md z-20 py-1 text-sm"
        >
          {(["bookmark", "project", "wishlist"] as const).map((s) => {
            const active = bookmark.status === s;
            return (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChangeStatus(s);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-800/60 ${
                  active
                    ? "font-medium text-stone-900 dark:text-stone-100"
                    : "text-stone-700 dark:text-stone-200"
                }`}
              >
                {STATUS_LABELS[s]}
                {active && (
                  <span
                    aria-hidden
                    className="ml-2 text-stone-400 dark:text-stone-500"
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
          <div className="border-t border-stone-200 dark:border-stone-800 my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onRemove();
              setOpen(false);
            }}
            className="w-full text-left px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-800/60 text-red-700 dark:text-red-400"
          >
            Remove
          </button>
        </div>
      )}
    </span>
  );
}

// Compact relative formatter for last-attempt timestamps. Kept here so
// the button's tooltip can match the /bookmarks page row.
export function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const day = 86_400_000;
  if (diff < day) return "today";
  const d = Math.round(diff / day);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}
