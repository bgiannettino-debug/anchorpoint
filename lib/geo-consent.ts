// Cookie that remembers the user's last known location so the home
// page can render the near-me map on any visit/navigation — including
// coming back from a climb page — without a client round-trip. The
// server reads it (cookies are server-readable, unlike localStorage,
// which is why this is also Safari-safe), the client writes it whenever
// the home page has a location.
export const LOCATION_COOKIE = "anchorpoint-loc";
// 30 days — long enough to persist across sessions, short enough that a
// stale location eventually ages out.
export const LOCATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Parse a "lat,lng" cookie value into numbers, or null if malformed. */
export function parseLocationCookie(
  value: string | undefined,
): { lat: number; lng: number } | null {
  if (!value) return null;
  const [latRaw, lngRaw] = value.split(",");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
