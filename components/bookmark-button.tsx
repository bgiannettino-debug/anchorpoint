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
  /**
   * Which edge the mobile status dropdown aligns to, so its popover
   * opens into the screen rather than off it. Right-aligned by default
   * (the area page renders this button at the top-right); the climb
   * page places it at the left of a row and passes "left".
   */
  menuAlign?: "left" | "right";
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
      menuAlign={props.menuAlign ?? "right"}
      onSetStatus={(s) => void setBookmarkStatus(found.type, found.uuid, s)}
      onRecordAttempt={() => void recordAttempt(found.type, found.uuid)}
      onRemove={() => void handleRemove()}
    />
  );
}

/**
 * Status picker. On desktop: a segmented row of three labeled chips
 * (current one filled), with Mark-attempt (project climbs only) and a
 * quiet Remove chip inline. On phones that row wrapped to two lines and
 * read as busy, so mobile collapses the whole thing into a single
 * status dropdown (see StatusMenu) — same pattern as the area-page sort
 * picker.
 */
function StatusChips({
  bookmark,
  isClimb,
  menuAlign = "right",
  onSetStatus,
  onRecordAttempt,
  onRemove,
}: {
  bookmark: Bookmark;
  isClimb: boolean;
  menuAlign?: "left" | "right";
  onSetStatus: (s: BookmarkStatus) => void;
  onRecordAttempt: () => void;
  onRemove: () => void;
}) {
  const isProjectClimb = bookmark.status === "project" && isClimb;

  return (
    <div role="group" aria-label="Bookmark status" className="inline-flex">
      {/* Desktop: segmented chips inline */}
      <div className="hidden sm:inline-flex flex-wrap items-center gap-2">
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
        {isProjectClimb && (
          <button
            type="button"
            onClick={onRecordAttempt}
            className={CHIP_INACTIVE}
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
          className={CHIP_REMOVE}
        >
          Remove
        </button>
      </div>

      {/* Mobile: one dropdown showing the current status */}
      <StatusMenu
        status={bookmark.status}
        showMarkAttempt={isProjectClimb}
        lastAttemptAt={bookmark.lastAttemptAt}
        align={menuAlign}
        onSetStatus={onSetStatus}
        onRecordAttempt={onRecordAttempt}
        onRemove={onRemove}
      />
    </div>
  );
}

const STATUSES: readonly BookmarkStatus[] = [
  "bookmark",
  "project",
  "wishlist",
] as const;

/**
 * Mobile-only status dropdown. The trigger is a filled chip showing the
 * current status + a chevron; tapping it opens a popover where you can
 * switch status (Saved / Project / Wishlist), Mark an attempt (project
 * climbs only), or Remove. Replaces the wrapping chip row + "More"
 * overflow on phones. Hidden on sm+ where the chips render inline.
 */
function StatusMenu({
  status,
  showMarkAttempt,
  lastAttemptAt,
  align,
  onSetStatus,
  onRecordAttempt,
  onRemove,
}: {
  status: BookmarkStatus;
  showMarkAttempt: boolean;
  lastAttemptAt: number | undefined;
  align: "left" | "right";
  onSetStatus: (s: BookmarkStatus) => void;
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

  const itemCls =
    "w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-stone-50 dark:hover:bg-stone-800/60";

  return (
    <span ref={ref} className="relative inline-flex sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${CHIP_ACTIVE} gap-1.5`}
      >
        {STATUS_LABELS[status]}
        <span
          aria-hidden
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Bookmark status"
          className={`absolute top-full ${
            align === "left" ? "left-0" : "right-0"
          } mt-1 w-48 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-md z-20 py-1 text-sm`}
        >
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={status === s}
              onClick={() => {
                if (status !== s) onSetStatus(s);
                setOpen(false);
              }}
              className={`${itemCls} text-stone-700 dark:text-stone-200`}
            >
              <span aria-hidden className="w-4 text-center">
                {status === s ? "✓" : ""}
              </span>
              {STATUS_LABELS[s]}
            </button>
          ))}
          <div className="my-1 border-t border-stone-200 dark:border-stone-800" />
          {showMarkAttempt && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRecordAttempt();
                setOpen(false);
              }}
              className={`${itemCls} text-stone-700 dark:text-stone-200`}
            >
              <span aria-hidden className="w-4" />
              <span>
                Mark attempt
                {lastAttemptAt && (
                  <span className="block text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    Last {formatRelative(lastAttemptAt)}
                  </span>
                )}
              </span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onRemove();
              setOpen(false);
            }}
            className={`${itemCls} text-red-700 dark:text-red-400`}
          >
            <span aria-hidden className="w-4" />
            Remove
          </button>
        </div>
      )}
    </span>
  );
}
