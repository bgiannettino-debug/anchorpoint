"use client";

// Tiny IndexedDB wrapper that holds full area / climb snapshots, keyed
// by uuid. When a user bookmarks something, we write its full
// rendered-page data here so a future offline visit can be served
// from a local copy rather than the browser's "no internet" page.
//
// Storage is intentionally generic (`data: unknown`) — the consumer
// (BookmarkButton + the area/climb pages) owns the shape, this layer
// just persists and retrieves blobs.

const DB_NAME = "anchorpoint-offline";
const DB_VERSION = 1;
const AREA_STORE = "areas";
const CLIMB_STORE = "climbs";

export type Snapshot<T = unknown> = {
  uuid: string;
  data: T;
  savedAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AREA_STORE)) {
        db.createObjectStore(AREA_STORE, { keyPath: "uuid" });
      }
      if (!db.objectStoreNames.contains(CLIMB_STORE)) {
        db.createObjectStore(CLIMB_STORE, { keyPath: "uuid" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAreaSnapshot(
  uuid: string,
  data: unknown,
): Promise<void> {
  try {
    await run(AREA_STORE, "readwrite", (s) =>
      s.put({ uuid, data, savedAt: Date.now() }),
    );
  } catch (err) {
    console.error("[offline-cache] save area failed:", err);
  }
}

export async function getAreaSnapshot<T = unknown>(
  uuid: string,
): Promise<Snapshot<T> | null> {
  try {
    const result = await run(AREA_STORE, "readonly", (s) => s.get(uuid));
    return (result as Snapshot<T> | undefined) ?? null;
  } catch (err) {
    console.error("[offline-cache] get area failed:", err);
    return null;
  }
}

export async function removeAreaSnapshot(uuid: string): Promise<void> {
  try {
    await run(AREA_STORE, "readwrite", (s) => s.delete(uuid));
  } catch (err) {
    console.error("[offline-cache] remove area failed:", err);
  }
}

export async function saveClimbSnapshot(
  uuid: string,
  data: unknown,
): Promise<void> {
  try {
    await run(CLIMB_STORE, "readwrite", (s) =>
      s.put({ uuid, data, savedAt: Date.now() }),
    );
  } catch (err) {
    console.error("[offline-cache] save climb failed:", err);
  }
}

export async function getClimbSnapshot<T = unknown>(
  uuid: string,
): Promise<Snapshot<T> | null> {
  try {
    const result = await run(CLIMB_STORE, "readonly", (s) => s.get(uuid));
    return (result as Snapshot<T> | undefined) ?? null;
  } catch (err) {
    console.error("[offline-cache] get climb failed:", err);
    return null;
  }
}

export async function removeClimbSnapshot(uuid: string): Promise<void> {
  try {
    await run(CLIMB_STORE, "readwrite", (s) => s.delete(uuid));
  } catch (err) {
    console.error("[offline-cache] remove climb failed:", err);
  }
}
