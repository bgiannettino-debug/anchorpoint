// Server-only. Reverse-geocodes lat/lng pairs to "City, ST"-style
// display strings via Mapbox, cached in Supabase so each coordinate
// only hits Mapbox once across all deploys.
//
// Falls back to returning an empty map when env vars are missing
// (local dev without secrets), so callers must handle "no location"
// gracefully by displaying the original coordinates.

import { createClient } from "@supabase/supabase-js";

type Coord = { lat: number; lng: number };

const COORD_DECIMALS = 4;

function round(n: number): number {
  // 4 decimal places ≈ 11m precision. OpenBeta gives 4-5 decimals
  // anyway, so this rounding rarely changes the visible value.
  const f = 10 ** COORD_DECIMALS;
  return Math.round(n * f) / f;
}

/** Stable key used for Map<key, display>. Always round before keying. */
export function locationKey(lat: number, lng: number): string {
  return `${round(lat)},${round(lng)}`;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "[geocoding] Missing env var(s):" +
        (!url ? " NEXT_PUBLIC_SUPABASE_URL" : "") +
        (!serviceKey ? " SUPABASE_SERVICE_ROLE_KEY" : ""),
    );
    return null;
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type MapboxFeature = {
  text: string;
  place_type?: string[];
  properties?: { short_code?: string };
};

type MapboxResult = {
  display: string;
  city: string | null;
  region: string | null;
  regionCode: string | null;
  country: string | null;
  countryCode: string | null;
};

async function fetchFromMapbox(
  lat: number,
  lng: number,
): Promise<MapboxResult | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    console.error("[geocoding] MAPBOX_ACCESS_TOKEN is not set");
    return null;
  }

  // Mapbox rejects `limit` when multiple types are passed (HTTP 422:
  // "limit must be combined with a single type parameter when reverse
  // geocoding"). Default behavior returns one feature per requested
  // type, which is exactly what we want.
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    `${lng},${lat}.json?access_token=${encodeURIComponent(token)}` +
    `&types=place,region,country`;

  try {
    // 5s cap — Mapbox itself is usually <200 ms but a cold serverless
    // function plus mobile-network jitter can push the first call past
    // a tight 2.5s budget, surfacing as false "couldn't reach the
    // database" errors. Still bounded enough to catch a real outage.
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[geocoding] Mapbox ${res.status} for ${lat},${lng}: ${body.slice(0, 200)}`,
      );
      return null;
    }
    const data = (await res.json()) as { features?: MapboxFeature[] };
    const features = data.features ?? [];

    const place = features.find((f) => f.place_type?.includes("place"));
    const region = features.find((f) => f.place_type?.includes("region"));
    const country = features.find((f) => f.place_type?.includes("country"));

    const city = place?.text ?? null;
    const regionText = region?.text ?? null;
    // Mapbox returns short codes like "us-ky" for state and "us" for
    // country. Strip the country prefix from region codes ("ky") and
    // upper-case both for display.
    const regionCode =
      region?.properties?.short_code?.split("-").pop()?.toUpperCase() ?? null;
    const countryText = country?.text ?? null;
    const countryCode =
      country?.properties?.short_code?.toUpperCase() ?? null;

    // Build the display string in priority order. US areas use the
    // postal-style "City, KY"; international areas use "City, Region"
    // or "City, Country" depending on what Mapbox returned.
    let display: string | null = null;
    if (city && regionCode && countryCode === "US") {
      display = `${city}, ${regionCode}`;
    } else if (city && regionText) {
      display = `${city}, ${regionText}`;
    } else if (city && countryText) {
      display = `${city}, ${countryText}`;
    } else if (regionText && countryText) {
      display = `${regionText}, ${countryText}`;
    } else if (regionText) {
      display = regionText;
    } else if (countryText) {
      display = countryText;
    }

    if (!display) return null;
    return {
      display,
      city,
      region: regionText,
      regionCode,
      country: countryText,
      countryCode,
    };
  } catch (err) {
    console.error(`[geocoding] Mapbox fetch failed for ${lat},${lng}:`, err);
    return null;
  }
}

/**
 * Detect a location-style search like "climbs near Bend, Oregon" or
 * "around Dallas, TX" and pull out the place ("Bend, Oregon"). Returns
 * null when the query isn't phrased as a place lookup, so the caller
 * falls back to a normal area-name search.
 *
 * Pure string helper — no network, safe to call anywhere.
 */
export function parsePlaceQuery(q: string): string | null {
  const m = q.match(
    /^\s*(?:climbs?\s+)?(?:near|around|nearby|close to|by|in)\s+(.+?)\s*$/i,
  );
  const place = m?.[1]?.trim();
  return place ? place : null;
}

/**
 * Forward-geocode a free-text place ("Bend, Oregon") to a coordinate
 * plus a tidy "City, ST" display, US-biased and top-match only. Returns
 * null when the token is missing or Mapbox finds nothing — callers
 * should fall back to a normal name search.
 *
 * Unlike reverse geocoding (one lookup per visible card, so it's
 * cached), this fires at most once per explicit place search, so we
 * skip the cache layer and hit Mapbox directly.
 */
export async function forwardGeocode(
  place: string,
): Promise<{ lat: number; lng: number; display: string } | null> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    console.error("[geocoding] MAPBOX_ACCESS_TOKEN is not set");
    return null;
  }
  const q = place.trim();
  if (!q) return null;

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    `${encodeURIComponent(q)}.json?access_token=${encodeURIComponent(token)}` +
    `&country=us&types=place,region,locality,district&limit=1&autocomplete=false`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[geocoding] Mapbox forward ${res.status} for "${q}": ${body.slice(0, 200)}`,
      );
      return null;
    }
    const data = (await res.json()) as {
      features?: {
        center?: [number, number];
        text?: string;
        place_name?: string;
        properties?: { short_code?: string };
        context?: { id: string; short_code?: string; text?: string }[];
      }[];
    };
    const f = data.features?.[0];
    if (!f?.center) return null;
    const [lng, lat] = f.center;

    // Prefer "City, ST". The region code lives in the context for a
    // place/locality match, or on the feature itself when the match IS
    // a region (e.g. a bare state). Fall back to Mapbox's place_name.
    const regionCtx = f.context?.find((c) => c.id.startsWith("region."));
    const shortCode = regionCtx?.short_code ?? f.properties?.short_code ?? null;
    const regionCode = shortCode?.split("-").pop()?.toUpperCase() ?? null;
    const name = f.text ?? q;
    const display =
      regionCode && !name.includes(",")
        ? `${name}, ${regionCode}`
        : (f.place_name?.replace(/, United States$/, "") ?? name);

    return { lat, lng, display };
  } catch (err) {
    console.error(`[geocoding] Mapbox forward failed for "${q}":`, err);
    return null;
  }
}

/**
 * Place suggestions for the Location typeahead. Like forwardGeocode but
 * autocomplete=true and up to 5 results, each with a tidy label and
 * coordinates. Returns [] when the token is missing or nothing matches.
 */
export async function suggestPlaces(
  query: string,
): Promise<{ label: string; lat: number; lng: number }[]> {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  const q = query.trim();
  if (!token || q.length < 2) return [];

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    `${encodeURIComponent(q)}.json?access_token=${encodeURIComponent(token)}` +
    `&country=us&types=place,region,locality,district&limit=5&autocomplete=true`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: {
        center?: [number, number];
        text?: string;
        place_name?: string;
      }[];
    };
    return (data.features ?? [])
      .filter((f) => Array.isArray(f.center))
      .map((f) => ({
        label: f.place_name?.replace(/, United States$/, "") ?? f.text ?? q,
        lng: f.center![0],
        lat: f.center![1],
      }));
  } catch (err) {
    console.error(`[geocoding] Mapbox suggest failed for "${q}":`, err);
    return [];
  }
}

/**
 * Resolve a batch of coordinates to display strings. Returns a Map
 * keyed by `locationKey(lat, lng)`. Coordinates without a result are
 * absent from the map; callers should fall back to showing coords.
 */
export async function resolveLocations(
  coords: Coord[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (coords.length === 0) return result;

  const admin = getAdminClient();
  if (!admin) return result;

  // Dedupe by rounded key so two cards at the same crag share a lookup.
  const unique = new Map<string, { lat: number; lng: number }>();
  for (const c of coords) {
    const lat = round(c.lat);
    const lng = round(c.lng);
    unique.set(`${lat},${lng}`, { lat, lng });
  }
  const uniqueList = Array.from(unique.values());

  // Bulk read from cache via a single .or() query.
  const orFilter = uniqueList
    .map((c) => `and(lat.eq.${c.lat},lng.eq.${c.lng})`)
    .join(",");
  const { data: cached, error: selectError } = await admin
    .from("geocoded_locations")
    .select("lat, lng, display")
    .or(orFilter);
  if (selectError) {
    console.error("[geocoding] Supabase select failed:", selectError);
  }

  const cachedKeys = new Set<string>();
  for (const row of (cached ?? []) as {
    lat: number;
    lng: number;
    display: string | null;
  }[]) {
    const key = `${row.lat},${row.lng}`;
    cachedKeys.add(key);
    if (row.display) result.set(key, row.display);
  }

  // Fetch the misses from Mapbox in parallel.
  const missing = uniqueList.filter(
    (c) => !cachedKeys.has(`${c.lat},${c.lng}`),
  );
  if (missing.length === 0) return result;

  const fetched = await Promise.all(
    missing.map(async (c) => ({ c, r: await fetchFromMapbox(c.lat, c.lng) })),
  );

  const toInsert = fetched
    .filter((f): f is { c: Coord; r: MapboxResult } => f.r !== null)
    .map((f) => ({
      lat: f.c.lat,
      lng: f.c.lng,
      display: f.r.display,
      city: f.r.city,
      region: f.r.region,
      region_code: f.r.regionCode,
      country: f.r.country,
      country_code: f.r.countryCode,
    }));

  if (toInsert.length > 0) {
    // Fire-and-forget. We don't want to block the response on a cache
    // write; the user-visible result is already determined.
    void admin
      .from("geocoded_locations")
      .upsert(toInsert, {
        onConflict: "lat,lng",
        ignoreDuplicates: true,
      })
      .then(({ error }) => {
        if (error) {
          console.error("[geocoding] Supabase upsert failed:", error);
        }
      });
  }

  for (const f of fetched) {
    if (f.r) result.set(`${f.c.lat},${f.c.lng}`, f.r.display);
  }
  return result;
}
