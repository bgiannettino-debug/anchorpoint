"use client";

import { createClient } from "@/lib/supabase/client";
import type {
  RealtimeChannel,
  SupabaseClient,
} from "@supabase/supabase-js";

export type BookmarkType = "area" | "climb";

// Free-form "what is this saved as" tag. Default ("bookmark") is just a
// save-for-later; "project" means actively working it (the climb page
// shows a Mark-attempt button); "wishlist" is aspirational. "Sent"
// isn't here — that's implied by having a tick for the climb.
export type BookmarkStatus = "bookmark" | "project" | "wishlist";

export type Bookmark = {
  type: BookmarkType;
  uuid: string;
  name: string;
  // For climbs only: grade label + parent area for context on lists.
  grade?: string;
  parentUuid?: string;
  parentName?: string;
  // For climbs only: the area ancestor chain (root-to-leaf, excluding
  // the climb itself). Used on the bookmarks page to nest a climb under
  // the closest bookmarked ancestor.
  ancestorUuids?: string[];
  // ms epoch; used to sort most-recently-bookmarked first.
  addedAt: number;
  status: BookmarkStatus;
  notes?: string;
  // ms epoch of the last "Mark attempt" tap. Only meaningful for
  // project-status bookmarks; the UI renders "Last tried Xd ago" from it.
  lastAttemptAt?: number;
};

type Row = {
  kind: BookmarkType;
  uuid: string;
  name: string;
  grade: string | null;
  parent_uuid: string | null;
  parent_name: string | null;
  ancestor_uuids: string[] | null;
  added_at: string;
  status: BookmarkStatus | null;
  notes: string | null;
  last_attempt_at: string | null;
};

const EMPTY: Bookmark[] = [];
const LEGACY_STORAGE_KEY = "anchorpoint:bookmarks";

let supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!supabase) supabase = createClient();
  return supabase;
}

// Module-level state. useSyncExternalStore needs getSnapshot to return a
// stable reference between renders, so we hold one array and replace it
// only when the data actually changes.
let cache: Bookmark[] = EMPTY;
let currentUserId: string | null = null;
let initialized = false;
let realtimeChannel: RealtimeChannel | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function rowToBookmark(row: Row): Bookmark {
  return {
    type: row.kind,
    uuid: row.uuid,
    name: row.name,
    grade: row.grade ?? undefined,
    parentUuid: row.parent_uuid ?? undefined,
    parentName: row.parent_name ?? undefined,
    ancestorUuids: row.ancestor_uuids ?? undefined,
    addedAt: new Date(row.added_at).getTime(),
    status: row.status ?? "bookmark",
    notes: row.notes ?? undefined,
    lastAttemptAt: row.last_attempt_at
      ? new Date(row.last_attempt_at).getTime()
      : undefined,
  };
}

async function fetchBookmarks(userId: string) {
  const { data, error } = await getSupabase()
    .from("bookmarks")
    .select(
      "kind, uuid, name, grade, parent_uuid, parent_name, ancestor_uuids, added_at, status, notes, last_attempt_at",
    )
    .eq("user_id", userId);
  if (error) {
    console.error("Failed to fetch bookmarks:", error);
    return;
  }
  cache = (data as Row[]).map(rowToBookmark);
  notify();
}

async function migrateLocalStorageBookmarks(userId: string) {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as { version?: number; items?: unknown };
    if (parsed?.version !== 1 || !Array.isArray(parsed.items)) {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return;
    }
    const rows = (parsed.items as Bookmark[]).map((b) => ({
      user_id: userId,
      kind: b.type,
      uuid: b.uuid,
      name: b.name,
      grade: b.grade ?? null,
      parent_uuid: b.parentUuid ?? null,
      parent_name: b.parentName ?? null,
      ancestor_uuids: b.ancestorUuids ?? null,
    }));
    if (rows.length === 0) {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return;
    }
    // Unique constraint on (user_id, kind, uuid) dedupes rows that the
    // user already saved on another device, so we use upsert with
    // ignoreDuplicates instead of a pre-fetch.
    const { error } = await getSupabase()
      .from("bookmarks")
      .upsert(rows, {
        onConflict: "user_id,kind,uuid",
        ignoreDuplicates: true,
      });
    if (!error) {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } else {
      console.error("Failed to migrate localStorage bookmarks:", error);
    }
  } catch {
    // Corrupted legacy data — drop it so we don't retry forever.
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}

async function teardownRealtime() {
  if (!realtimeChannel) return;
  await getSupabase().removeChannel(realtimeChannel);
  realtimeChannel = null;
}

function setupRealtime(userId: string) {
  realtimeChannel = getSupabase()
    .channel(`bookmarks:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bookmarks",
        filter: `user_id=eq.${userId}`,
      },
      () => {
        void fetchBookmarks(userId);
      },
    )
    .subscribe();
}

async function syncUser(userId: string | null) {
  if (userId === currentUserId) return;
  await teardownRealtime();
  currentUserId = userId;
  if (!userId) {
    if (cache !== EMPTY) {
      cache = EMPTY;
      notify();
    }
    return;
  }
  await migrateLocalStorageBookmarks(userId);
  await fetchBookmarks(userId);
  setupRealtime(userId);
}

function initialize() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const client = getSupabase();
  void client.auth
    .getSession()
    .then(({ data }) => syncUser(data.session?.user.id ?? null));
  client.auth.onAuthStateChange((_event, session) => {
    void syncUser(session?.user.id ?? null);
  });
}

export function subscribeBookmarks(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(listener);
  initialize();
  return () => {
    listeners.delete(listener);
  };
}

export function getBookmarksSnapshot(): Bookmark[] {
  return cache;
}

export function getBookmarksServerSnapshot(): Bookmark[] {
  return EMPTY;
}

export function isBookmarked(type: BookmarkType, uuid: string): boolean {
  return cache.some((b) => b.type === type && b.uuid === uuid);
}

// Status is optional at the call site so existing add-from-search
// callers don't have to specify it; it defaults to a plain bookmark
// and the user changes it from the menu afterwards.
export type NewBookmark = Omit<Bookmark, "addedAt" | "status"> & {
  status?: BookmarkStatus;
};

export async function addBookmark(b: NewBookmark): Promise<void> {
  if (!currentUserId) return;
  if (cache.some((x) => x.type === b.type && x.uuid === b.uuid)) return;

  const status: BookmarkStatus = b.status ?? "bookmark";

  // Optimistic update so the UI reflects the click immediately. Realtime
  // will reconcile with a fresh fetch shortly after.
  const optimistic: Bookmark = { ...b, addedAt: Date.now(), status };
  cache = [...cache, optimistic];
  notify();

  const { error } = await getSupabase().from("bookmarks").insert({
    user_id: currentUserId,
    kind: b.type,
    uuid: b.uuid,
    name: b.name,
    grade: b.grade ?? null,
    parent_uuid: b.parentUuid ?? null,
    parent_name: b.parentName ?? null,
    ancestor_uuids: b.ancestorUuids ?? null,
    status,
  });
  // 23505 = unique_violation. That means it was already bookmarked
  // (e.g. another device just inserted it) — keep the optimistic state.
  if (error && error.code !== "23505") {
    console.error("Failed to insert bookmark:", error);
    cache = cache.filter((x) => !(x.type === b.type && x.uuid === b.uuid));
    notify();
  }
}

export async function removeBookmark(
  type: BookmarkType,
  uuid: string,
): Promise<void> {
  if (!currentUserId) return;
  const prev = cache;
  cache = cache.filter((b) => !(b.type === type && b.uuid === uuid));
  if (cache === prev) return;
  notify();

  const { error } = await getSupabase()
    .from("bookmarks")
    .delete()
    .match({ user_id: currentUserId, kind: type, uuid });
  if (error) {
    console.error("Failed to delete bookmark:", error);
    cache = prev;
    notify();
  }
}

/** Toggles and returns the new saved state. Now async since it hits the API. */
export async function toggleBookmark(b: NewBookmark): Promise<boolean> {
  if (isBookmarked(b.type, b.uuid)) {
    await removeBookmark(b.type, b.uuid);
    return false;
  }
  await addBookmark(b);
  return true;
}

export function getBookmark(
  type: BookmarkType,
  uuid: string,
): Bookmark | undefined {
  return cache.find((b) => b.type === type && b.uuid === uuid);
}

// Generic optimistic patch: applies the partial Bookmark change in the
// in-memory cache first, then writes the matching column update to
// Supabase, reverting on error. Used by the status / notes / attempt
// helpers below — they're all the same shape on the wire.
async function patchBookmark(
  type: BookmarkType,
  uuid: string,
  patch: Partial<Bookmark>,
  dbPatch: Record<string, unknown>,
): Promise<void> {
  if (!currentUserId) return;
  const prev = cache;
  const next = cache.map((b) =>
    b.type === type && b.uuid === uuid ? { ...b, ...patch } : b,
  );
  if (next === prev) return;
  cache = next;
  notify();

  const { error } = await getSupabase()
    .from("bookmarks")
    .update(dbPatch)
    .match({ user_id: currentUserId, kind: type, uuid });
  if (error) {
    console.error("Failed to update bookmark:", error);
    cache = prev;
    notify();
  }
}

export async function setBookmarkStatus(
  type: BookmarkType,
  uuid: string,
  status: BookmarkStatus,
): Promise<void> {
  await patchBookmark(type, uuid, { status }, { status });
}

export async function setBookmarkNotes(
  type: BookmarkType,
  uuid: string,
  notes: string,
): Promise<void> {
  // Empty string → null so the row is "no notes" rather than an empty
  // string artifact.
  const trimmed = notes.trim();
  const value = trimmed.length > 0 ? trimmed : null;
  await patchBookmark(
    type,
    uuid,
    { notes: value ?? undefined },
    { notes: value },
  );
}

/**
 * Stamp the bookmark's last_attempt_at to now. Climb pages call this
 * from the Mark-attempt button so projects feel like a living list.
 */
export async function recordAttempt(
  type: BookmarkType,
  uuid: string,
): Promise<void> {
  const now = Date.now();
  await patchBookmark(
    type,
    uuid,
    { lastAttemptAt: now },
    { last_attempt_at: new Date(now).toISOString() },
  );
}
