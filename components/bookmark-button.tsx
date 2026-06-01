"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

// Label + leading glyph for each status. Kept in one place so the
// button row, the menu (if anyone re-adds one), and the bookmarks
// page can share them.
export const STATUS_LABELS: Record<BookmarkStatus, string> = {
  bookmark: "★ Saved",
  project: "▶ Project",
  wishlist: "○ Wishlist",
};

// Compact relative formatter used by the Mark-attempt button's
// tooltip + the /bookmarks page row.
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

const CHIP_BASE =
  "shrink-0 inline-flex items-center text-sm px-3 py-1.5 rounded-full transition-colors";
const CHIP_INACTIVE =
  `${CHIP_BASE} border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50`;
const CHIP_ACTIVE =
  `${CHIP_BASE} bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium border border-stone-900 dark:border-stone-100`;
const CHIP_REMOVE =
  `${CHIP_BASE} border border-stone-300 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-red-400 dark:hover:border-red-700 hover:text-red-700 dark:hover:text-red-400`;

export function BookmarkButton(props: Props) {
  const auth = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthServerSnapshot,
  );

  if (auth.status === "loading") {
    // Reserve the same footprint so the layout doesn't jump on hydration.
    return (
      <span className={`${CHIP_INACTIVE} opacity-0`} aria-hidden="true">
        ☆ Save
      </span>
    );
  }

  if (auth.status === "signed-out") {
    return (
      <Link href="/login" className={CHIP_INACTIVE}>
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
        className={CHIP_INACTIVE}
      >
        ☆ Save
      </button>
    );
  }

  return (
    <StatusChips
      bookmark={found}
      isClimb={props.type === "climb"}
      onSetStatus={(s) => void setBookmarkStatus(found.type, found.uuid, s)}
      onRecordAttempt={() => void recordAttempt(found.type, found.uuid)}
      onRemove={() => void handleRemove()}
    />
  );
}

/**
 * Segmented status picker. Three labeled chips, current one filled —
 * tapping any chip sets that status (or no-ops if it's already
 * active). Mark-attempt sits inline for project-status climbs, and
 * Remove is a quiet outline chip after the row so it's discoverable
 * but not the loudest thing on the page.
 */
function StatusChips({
  bookmark,
  isClimb,
  onSetStatus,
  onRecordAttempt,
  onRemove,
}: {
  bookmark: Bookmark;
  isClimb: boolean;
  onSetStatus: (s: BookmarkStatus) => void;
  onRecordAttempt: () => void;
  onRemove: () => void;
}) {
  const STATUSES: readonly BookmarkStatus[] = [
    "bookmark",
    "project",
    "wishlist",
  ] as const;
  const isProjectClimb = bookmark.status === "project" && isClimb;

  return (
    <div
      role="group"
      aria-label="Bookmark status"
      className="inline-flex flex-wrap items-center gap-2"
    >
      {STATUSES.map((s) => {
        const active = bookmark.status === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => {
              if (!active) onSetStatus(s);
            }}
            aria-pressed={active}
            className={active ? CHIP_ACTIVE : CHIP_INACTIVE}
          >
            {STATUS_LABELS[s]}
          </button>
        );
      })}
      {/* Desktop: Mark attempt + Remove are inline. On mobile they
          collapse into a More menu so the action row doesn't wrap to
          three lines on a phone. */}
      {isProjectClimb && (
        <button
          type="button"
          onClick={onRecordAttempt}
          className={`${CHIP_INACTIVE} hidden sm:inline-flex`}
          title={
            bookmark.lastAttemptAt
              ? `Last attempt ${formatRelative(bookmark.lastAttemptAt)}`
              : "Stamp this attempt with today's date"
          }
        >
          Mark attempt
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove from bookmarks"
        className={`${CHIP_REMOVE} hidden sm:inline-flex`}
      >
        Remove
      </button>
      <MoreMenu
        showMarkAttempt={isProjectClimb}
        lastAttemptAt={bookmark.lastAttemptAt}
        onRecordAttempt={onRecordAttempt}
        onRemove={onRemove}
      />
    </div>
  );
}

/**
 * Mobile-only overflow menu for the action row. Renders a "⋯ More"
 * chip; tapping it opens a small popover with the secondary actions
 * (Mark attempt — if applicable — and Remove). Hidden on sm+ where
 * those actions are inline.
 */
function MoreMenu({
  showMarkAttempt,
  lastAttemptAt,
  onRecordAttempt,
  onRemove,
}: {
  showMarkAttempt: boolean;
  lastAttemptAt: number | undefined;
  onRecordAttempt: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

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

  return (
    <span ref={ref} className="relative inline-flex sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        className={CHIP_INACTIVE}
      >
        ⋯ More
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-1 w-48 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-md z-20 py-1 text-sm"
        >
          {showMarkAttempt && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRecordAttempt();
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-200"
            >
              Mark attempt
              {lastAttemptAt && (
                <span className="block text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Last {formatRelative(lastAttemptAt)}
                </span>
              )}
            </button>
          )}
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
