// Minimal service worker — caches the app shell + static assets so
// Anchorpoint loads when the user has no signal at the crag. Does NOT
// cache OpenBeta / Supabase / Mapbox responses (data freshness wins);
// per-bookmark snapshots will live in IndexedDB in a follow-up.

const CACHE = "anchorpoint-shell-v1";
const APP_SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  // skipWaiting so updates take effect on the next page load rather
  // than waiting for every open tab to close.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Don't touch third-party requests (OpenBeta GraphQL, Supabase,
  // Mapbox tiles, etc.). We'd cache stale data and tracking pixels.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, fall back to the cached home shell so
  // the user sees something rather than the browser's offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
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

  // Static assets (Next chunks, CSS, fonts, our SVG icon): cache first
  // and store on miss. Next fingerprints filenames so stale assets
  // are naturally invalidated by URL change.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((resp) => {
        if (resp.ok && resp.type === "basic") {
          const clone = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return resp;
      });
    }),
  );
});
