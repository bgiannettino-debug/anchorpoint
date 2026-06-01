"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  type Bookmark,
  type BookmarkStatus,
  getBookmarksServerSnapshot,
  getBookmarksSnapshot,
  removeBookmark,
  setBookmarkNotes,
  subscribeBookmarks,
} from "@/lib/bookmarks";
import {
  getAuthServerSnapshot,
  getAuthSnapshot,
  subscribeAuth,
} from "@/lib/auth";
import { formatRelative, STATUS_LABELS } from "@/components/bookmark-button";

export default function BookmarksPage() {
  const auth = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthServerSnapshot,
  );
  const items = useSyncExternalStore(
    subscribeBookmarks,
    getBookmarksSnapshot,
    getBookmarksServerSnapshot,
  );

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

        {auth.status === "loading" ? null : auth.status === "signed-out" ? (
          <p className="text-stone-500 dark:text-stone-400">
            <Link
              href="/login"
              className="underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
            >
              Sign in
            </Link>{" "}
            to view your bookmarks.
          </p>
        ) : (
          <BookmarksByStatus items={items} />
        )}
      </div>
    </main>
  );
}

function BookmarksByStatus({ items }: { items: Bookmark[] }) {
  if (items.length === 0) {
    return (
      <p className="text-stone-500 dark:text-stone-400">
        You haven&apos;t bookmarked anything yet. Open an area or climb and
        choose Save → Bookmark / Project / Wishlist.
      </p>
    );
  }

  // Projects first (active work), then wishlist (aspirational), then
  // the catch-all bookmark pile.
  const projects = items
    .filter((b) => b.status === "project")
    .sort(byLastAttemptThenAdded);
  const wishlist = items
    .filter((b) => b.status === "wishlist")
    .sort(byAddedDesc);
  const saved = items
    .filter((b) => b.status === "bookmark")
    .sort(byAddedDesc);

  return (
    <>
      <StatusSection
        title="Projects"
        status="project"
        items={projects}
        emptyHint="Mark a climb as Project from its page to add it here."
      />
      <StatusSection
        title="Wishlist"
        status="wishlist"
        items={wishlist}
        emptyHint="Save areas or climbs as Wishlist for someday."
      />
      <StatusSection
        title="Saved"
        status="bookmark"
        items={saved}
        emptyHint="Save areas or climbs as Saved to remember them."
        nestClimbsUnderAreas
      />
    </>
  );
}

function StatusSection({
  title,
  status,
  items,
  emptyHint,
  nestClimbsUnderAreas = false,
}: {
  title: string;
  status: BookmarkStatus;
  items: Bookmark[];
  emptyHint: string;
  nestClimbsUnderAreas?: boolean;
}) {
  if (items.length === 0) return null;

  const isProject = status === "project";

  // Only the "Saved" pile nests climbs under their ancestor area —
  // projects and the wishlist are intentionally flat because they're
  // about specific routes, not whole crags.
  let rows: { bookmark: Bookmark; indent: boolean }[];
  if (nestClimbsUnderAreas) {
    rows = nestRows(items);
  } else {
    rows = items
      .sort(isProject ? byLastAttemptThenAdded : byAddedDesc)
      .map((b) => ({ bookmark: b, indent: false }));
  }

  return (
    <section className="mb-10">
      <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-1">
        {title} ({items.length})
      </h2>
      <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
        {emptyHint}
      </p>
      <ul className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 divide-y divide-stone-200 dark:divide-stone-800">
        {rows.map(({ bookmark, indent }) => (
          <BookmarkRow
            key={`${bookmark.type}:${bookmark.uuid}`}
            bookmark={bookmark}
            indent={indent}
          />
        ))}
      </ul>
    </section>
  );
}

function BookmarkRow({
  bookmark: b,
  indent,
}: {
  bookmark: Bookmark;
  indent: boolean;
}) {
  const isProject = b.status === "project";
  return (
    <li>
      <div className="flex items-baseline">
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
          {isProject && b.lastAttemptAt && (
            <div className="text-xs text-stone-500 dark:text-stone-400 mt-1">
              Last attempt {formatRelative(b.lastAttemptAt)}
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={() => void removeBookmark(b.type, b.uuid)}
          aria-label={`Remove ${b.name} (${STATUS_LABELS[b.status]})`}
          // Hidden on mobile: phone users remove via the Save menu on
          // the area/climb page instead, where the tap target is bigger
          // and there's no risk of an accidental remove next to the
          // row's main Link.
          className="hidden sm:block px-4 py-3 text-sm text-stone-500 dark:text-stone-400 hover:text-red-700 dark:hover:text-red-400 transition-colors"
        >
          Remove
        </button>
      </div>
      {isProject && (
        <NotesEditor
          key={`notes:${b.type}:${b.uuid}`}
          bookmark={b}
          indent={indent}
        />
      )}
    </li>
  );
}

/**
 * Inline notes editor for project rows. Persists on blur (debounced
 * via the simpler "save when the user stops typing for 600 ms"
 * pattern) so the user gets reliable saves without an explicit button.
 */
function NotesEditor({
  bookmark: b,
  indent,
}: {
  bookmark: Bookmark;
  indent: boolean;
}) {
  const [draft, setDraft] = useState(b.notes ?? "");

  // No store-sync effect: the textarea is the user's authoritative
  // draft while they're typing. If another tab edits notes mid-session
  // the change shows up next time this component re-mounts (key includes
  // the bookmark identity). Avoids the React-19 setState-in-effect lint
  // and prevents cursor-jump while typing.

  useEffect(() => {
    if (draft === (b.notes ?? "")) return;
    const t = setTimeout(() => {
      void setBookmarkNotes(b.type, b.uuid, draft);
    }, 600);
    return () => clearTimeout(t);
  }, [draft, b.type, b.uuid, b.notes]);

  return (
    <div className={indent ? "pb-3 pl-12 pr-6" : "pb-3 px-6"}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Notes — beta, conditions, send plan…"
        rows={2}
        className="w-full text-sm px-3 py-2 rounded-md border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 resize-none"
      />
    </div>
  );
}

function byAddedDesc(a: Bookmark, b: Bookmark): number {
  return b.addedAt - a.addedAt;
}
function byLastAttemptThenAdded(a: Bookmark, b: Bookmark): number {
  const aLast = a.lastAttemptAt ?? 0;
  const bLast = b.lastAttemptAt ?? 0;
  if (bLast !== aLast) return bLast - aLast;
  return b.addedAt - a.addedAt;
}

/**
 * Nest climb rows under their nearest bookmarked ancestor area. Used
 * only inside the "Saved" section — projects and the wishlist render
 * flat because they're per-route.
 */
function nestRows(items: Bookmark[]): { bookmark: Bookmark; indent: boolean }[] {
  const areas = items
    .filter((b) => b.type === "area")
    .sort(byAddedDesc);
  const climbs = items
    .filter((b) => b.type === "climb")
    .sort(byAddedDesc);
  const areaIds = new Set(areas.map((a) => a.uuid));
  const climbsByArea = new Map<string, Bookmark[]>();
  const orphans: Bookmark[] = [];

  for (const climb of climbs) {
    const chain =
      climb.ancestorUuids ?? (climb.parentUuid ? [climb.parentUuid] : []);
    let parent: string | null = null;
    for (let i = chain.length - 1; i >= 0; i--) {
      if (areaIds.has(chain[i])) {
        parent = chain[i];
        break;
      }
    }
    if (parent) {
      const list = climbsByArea.get(parent) ?? [];
      list.push(climb);
      climbsByArea.set(parent, list);
    } else {
      orphans.push(climb);
    }
  }

  const out: { bookmark: Bookmark; indent: boolean }[] = [];
  for (const area of areas) {
    out.push({ bookmark: area, indent: false });
    for (const climb of climbsByArea.get(area.uuid) ?? []) {
      out.push({ bookmark: climb, indent: true });
    }
  }
  for (const climb of orphans) {
    out.push({ bookmark: climb, indent: false });
  }
  return out;
}

