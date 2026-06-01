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
    // 2.5s cap — Mapbox is normally <200 ms, so anything past this is
    // an outage. Without the cap, one slow upstream stalls a whole
    // home render that geocodes many coords.
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
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
