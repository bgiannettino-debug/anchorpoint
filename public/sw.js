// Service worker for Anchorpoint.
//
// Two caches:
//   SHELL_CACHE — the JS/CSS/font bundle that makes the app render at all.
//                 Cache-first; small set, infrequently updated.
//   PAGES_CACHE — per-URL navigation responses (the rendered HTML +
//                 streamed RSC payload). Network-first; updated every
//                 time the user visits a page online, served back when
//                 they revisit offline. Capped at MAX_PAGES so it
//                 doesn't grow unbounded.
//
// We deliberately don't cache OpenBeta / Supabase / Mapbox requests
// (third-party) — page captures already inline the data they need,
// and live data should always win when there's signal.

const SHELL_CACHE = "anchorpoint-shell-v1";
const PAGES_CACHE = "anchorpoint-pages-v1";
const SHELL_PRELOAD = ["/", "/manifest.webmanifest"];
const MAX_PAGES = 50;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_PRELOAD)),
  );
});

self.addEventListener("activate", (event) => {
  const allowed = new Set([SHELL_CACHE, PAGES_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !allowed.has(k)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  // FIFO — first-added are the oldest entries.
  for (let i = 0; i < keys.length - max; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: network-first so signed-in users always see the
  // freshest auth state / data when online. Cache the response so the
  // same URL is available offline next time.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          if (resp.ok && resp.type === "basic") {
            const clone = resp.clone();
            caches.open(PAGES_CACHE).then(async (cache) => {
              await cache.put(request, clone);
              await trimCache(PAGES_CACHE, MAX_PAGES);
            });
          }
          return resp;
        })
        .catch(async () => {
          // Offline — prefer a cached copy of this exact URL, then the
          // home shell, then a plain 503 string as the last resort.
          const cachedUrl = await caches.match(request);
          if (cachedUrl) return cachedUrl;
          const shell = await caches.match("/");
          return (
            shell ??
            new Response("Offline", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }),
    );
    return;
  }

  // Static assets — cache-first, fill on miss. Next fingerprints
  // filenames so old assets naturally fall out of use.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((resp) => {
        if (resp.ok && resp.type === "basic") {
          const clone = resp.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
        }
        return resp;
      });
    }),
  );
});
