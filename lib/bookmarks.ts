export type BookmarkType = "area" | "climb";

export type Bookmark = {
  type: BookmarkType;
  uuid: string;
  name: string;
  // For climbs only: grade label + parent area for context on lists.
  grade?: string;
  parentUuid?: string;
  parentName?: string;
  // ms epoch; used to sort most-recently-bookmarked first.
  addedAt: number;
};

type StoredShape = {
  version: 1;
  items: Bookmark[];
};

const STORAGE_KEY = "anchorpoint:bookmarks";

// Cached snapshot. `useSyncExternalStore` requires `getSnapshot` to return
// a stable reference when nothing has changed, so we hold one array and
// only replace it when we mutate or detect a cross-tab `storage` event.
const EMPTY: Bookmark[] = [];
let cache: Bookmark[] = EMPTY;
let initialized = false;

function loadFromStorage(): Bookmark[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as StoredShape).version === 1 &&
      Array.isArray((parsed as StoredShape).items)
    ) {
      return (parsed as StoredShape).items;
    }
  } catch {
    // Corrupted localStorage — fall through to a fresh store.
  }
  return [];
}

function ensureLoaded() {
  if (!initialized && typeof window !== "undefined") {
    cache = loadFromStorage();
    initialized = true;
  }
}

function commit(next: Bookmark[]) {
  cache = next;
  if (typeof window !== "undefined") {
    const payload: StoredShape = { version: 1, items: next };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }
  notifyAll();
}

const listeners = new Set<() => void>();
let storageHandlerAttached = false;

function notifyAll() {
  for (const l of listeners) l();
}

function handleStorageEvent(e: StorageEvent) {
  if (e.key !== STORAGE_KEY) return;
  // Another tab updated us — refresh the cache and tell subscribers.
  cache = loadFromStorage();
  notifyAll();
}

/** Subscribe to bookmark-store changes. Returns an unsubscribe fn. */
export function subscribeBookmarks(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(listener);
  if (!storageHandlerAttached) {
    window.addEventListener("storage", handleStorageEvent);
    storageHandlerAttached = true;
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Returns a stable snapshot for `useSyncExternalStore`. */
export function getBookmarksSnapshot(): Bookmark[] {
  ensureLoaded();
  return cache;
}

/** SSR snapshot — must be stable across renders. */
export function getBookmarksServerSnapshot(): Bookmark[] {
  return EMPTY;
}

export function isBookmarked(type: BookmarkType, uuid: string): boolean {
  ensureLoaded();
  return cache.some((b) => b.type === type && b.uuid === uuid);
}

export function addBookmark(b: Omit<Bookmark, "addedAt">): void {
  ensureLoaded();
  if (cache.some((item) => item.type === b.type && item.uuid === b.uuid)) {
    return;
  }
  commit([...cache, { ...b, addedAt: Date.now() }]);
}

export function removeBookmark(type: BookmarkType, uuid: string): void {
  ensureLoaded();
  commit(cache.filter((item) => !(item.type === type && item.uuid === uuid)));
}

/** Toggles and returns the new saved state. */
export function toggleBookmark(b: Omit<Bookmark, "addedAt">): boolean {
  if (isBookmarked(b.type, b.uuid)) {
    removeBookmark(b.type, b.uuid);
    return false;
  }
  addBookmark(b);
  return true;
}
