import { Suspense } from "react";
import Link from "next/link";
import { getClient } from "@/lib/apollo-client";
import { AreaCard, type AreaCardData } from "@/components/area-card";
import { cookies } from "next/headers";
import { NearMeButton } from "@/components/near-me-button";
import { NearMap } from "@/components/near-map";
import { LocationSync } from "@/components/location-sync";
import { LOCATION_COOKIE, parseLocationCookie } from "@/lib/geo-consent";
import { BookmarksPreview } from "@/components/bookmarks-preview";
import { TicksPreview } from "@/components/ticks-preview";
import {
  ClimbResultsGrouped,
  type ClimbResult,
} from "@/components/climb-results-grouped";
import { TypeFilterChips } from "@/components/type-filter-chips";
import { GradeRangeFilter } from "@/components/grade-range-filter";
import { WeatherForecast } from "@/components/weather-forecast";
import { WeatherSkeleton } from "@/components/weather-skeleton";
import { haversineMiles } from "@/lib/geo";
import { parseTypeFilter } from "@/lib/climb-types";
import {
  EMPTY_GRADE_RANGE,
  gradeRangeToBounds,
  parseGradeRange,
  type GradeRange,
} from "@/lib/grade-options";
import {
  forwardGeocode,
  locationKey,
  parsePlaceQuery,
  resolveLocations,
} from "@/lib/geocoding";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gql } from "@apollo/client";

type GetAreasResponse = {
  areas: AreaCardData[];
};

type CragsNearGroup = {
  _id: number;
  count: number;
  crags: AreaCardData[] | null;
};

type GetCragsNearResponse = {
  cragsNear: (CragsNearGroup | null)[] | null;
};

// Distance tiers (miles) for the near-me query, tried smallest-first.
// `cragsNear` has no result limit, so both the payload and OpenBeta's
// per-crag grade aggregation scale with the radius — a single 200-mile
// query around a dense region (e.g. Boulder pulls ~5.5k crags) blows
// past the 8s upstream timeout. So we start small and widen only when a
// region comes back sparse: dense regions resolve on the first tiny
// query, sparse ones still reach 200 miles. Each tier is 0..max, i.e. a
// superset of the previous, so the stopping tier's result is complete.
const NEAR_RADII_MILES = [25, 75, 200] as const;
// How many cards to display on the first render. "Show more" reveals
// another NEAR_PAGE_SIZE worth at a time.
const NEAR_INITIAL_SHOWN = 20;
const NEAR_PAGE_SIZE = 20;
// Absolute ceiling on rendered cards so a malformed ?shown=99999
// can't blow up the page.
const NEAR_MAX_SHOWN = 200;

function parseShown(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < NEAR_INITIAL_SHOWN) return NEAR_INITIAL_SHOWN;
  return Math.min(n, NEAR_MAX_SHOWN);
}

// Use the area's `aggregate.byGrade` and `totalClimbs` so the counts/grade
// range are recursive — a parent area like "Smith Rock" reports all 1200+
// climbs nested under its children, not just whatever (if anything) is
// attached directly to that node.
const GET_AREAS = gql`
  query GetAreas($query: String!) {
    areas(filter: { area_name: { match: $query, exactMatch: false } }) {
      uuid
      area_name
      totalClimbs
      metadata {
        lat
        lng
      }
      aggregate {
        byGrade {
          label
          count
        }
      }
    }
  }
`;

// Note: we deliberately don't select `placeId` from cragsNear groups.
// OpenBeta's API throws "Cannot return null for non-nullable field
// CragsNear.placeId" when no placeId input is provided, even though the
// query without it returns useful data. errorPolicy "all" elsewhere
// would also work, but skipping the field is cleaner.
const GET_CRAGS_NEAR = gql`
  query GetCragsNear($lat: Float!, $lng: Float!, $max: Int!) {
    cragsNear(
      lnglat: { lat: $lat, lng: $lng }
      minDistance: 0
      maxDistance: $max
      includeCrags: true
    ) {
      _id
      count
      crags {
        uuid
        area_name
        totalClimbs
        metadata {
          lat
          lng
        }
        aggregate {
          byGrade {
            label
            count
          }
        }
      }
    }
  }
`;

type NearCrag = AreaCardData & { distanceMiles: number };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    lat?: string;
    lng?: string;
    place?: string;
    shown?: string;
    mode?: string;
    type?: string;
    ydsMin?: string;
    ydsMax?: string;
    vMin?: string;
    vMax?: string;
  }>;
}) {
  const sp = await searchParams;
  const { q, lat, lng, shown: shownRaw, mode: modeRaw, type: typeRaw } = sp;
  const query = q?.trim() ?? "";
  // Human-readable place label carried from a "climbs near <place>"
  // redirect, shown in the near-me heading ("Climbs near Bend, OR").
  const placeLabel = sp.place?.trim() || undefined;
  // "areas" (default) searches the OpenBeta area index; "routes" searches
  // our Supabase climbs_index by name. The two tabs above the search box
  // flip this; a hidden input carries it through form submission.
  const mode =
    modeRaw === "routes"
      ? "routes"
      : modeRaw === "location"
        ? "location"
        : "areas";

  // Place search → forward-geocode and hand off to the near-me view at
  // those coordinates (which already does distance ranking, the map,
  // pagination, etc.). In the Location tab the whole query is the place;
  // in Areas mode we accept a "near <place>" prefix as a shortcut. If
  // Mapbox can't resolve it we fall through (Location shows a
  // not-found note; Areas runs a normal name search). The redirect
  // drops `q`, so this can't loop.
  if (query && (mode === "location" || mode === "areas")) {
    const place =
      mode === "location"
        ? (parsePlaceQuery(query) ?? query)
        : parsePlaceQuery(query);
    if (place) {
      const geo = await forwardGeocode(place);
      if (geo) {
        redirect(
          `/?lat=${geo.lat.toFixed(5)}&lng=${geo.lng.toFixed(5)}` +
            `&place=${encodeURIComponent(geo.display)}`,
        );
      }
    }
  }
  // Discipline chips for Routes mode (Sport/Trad/Boulder/…). Only applied
  // when searching routes.
  const typeFilter = mode === "routes" ? parseTypeFilter(typeRaw) : new Set<string>();
  // Grade range — Routes mode only. Areas search uses OpenBeta and has
  // no notion of grade bounds.
  const gradeRange: GradeRange =
    mode === "routes" ? parseGradeRange(sp) : EMPTY_GRADE_RANGE;

  // Location and search are now independent. Location (lat/lng) always
  // drives the map + the near-me list; a query drives the search-results
  // list and takes precedence for the *content* area below the map. So
  // searching no longer wipes the map — the location stays in the URL.
  // URL params win; otherwise fall back to the last-known location
  // cookie so the map survives a round-trip through a climb/area page
  // (whose URLs don't carry lat/lng) and a return to "/". Kept as
  // const so TS narrows them inside `if (hasLocation)` blocks.
  const urlLat = parseCoord(lat);
  const urlLng = parseCoord(lng);
  const cookieLoc =
    urlLat === null || urlLng === null
      ? parseLocationCookie((await cookies()).get(LOCATION_COOKIE)?.value)
      : null;
  const userLat = urlLat ?? cookieLoc?.lat ?? null;
  const userLng = urlLng ?? cookieLoc?.lng ?? null;
  const hasLocation = userLat !== null && userLng !== null;
  const shown = parseShown(shownRaw);
  // Which tab reads as active. A location-anchored near view with *no
  // explicit mode* (a place-search redirect, the GPS "near me" button,
  // or a saved-location home visit — all of which omit `mode`) lights up
  // Location. But an explicit tab choice always wins: clicking Areas or
  // Routes preserves the location for the map yet sets `mode`, so it
  // must stay highlighted rather than falling back to Location.
  const hasExplicitMode =
    modeRaw === "areas" || modeRaw === "routes" || modeRaw === "location";
  const activeTab =
    !hasExplicitMode && hasLocation && !query ? "location" : mode;

  // Run the two independent upstream calls — near-me (OpenBeta) and
  // the active search (OpenBeta areas OR Supabase routes) — in
  // parallel. Each tracks its own error so a slow / failing one
  // doesn't take the other down, and the page only waits for the
  // slower of the two instead of both serially.
  const [
    { nearResults, nearError },
    { areas, routes, searchError, routeError },
  ] = await Promise.all([
    fetchNearResults(hasLocation, userLat, userLng),
    fetchSearchResults(query, mode, typeFilter, gradeRange),
  ]);
  // Distinct crags among the route hits — shown in the results heading
  // since results are grouped by area.
  const routeAreaCount = new Set(
    routes.map((r) => r.area_uuid ?? r.area_name ?? "—"),
  ).size;

  // Batch-resolve City/State labels for only the cards we'll actually
  // render — the near-me list is capped at NEAR_MAX_SHOWN (200) but
  // only `shown` cards (default 20, plus NEAR_PAGE_SIZE per "Show
  // more" click) are visible at a time. Geocoding the unrendered tail
  // burned Mapbox quota and stretched cold-cache renders for no UI
  // gain — the map pins below use raw lat/lng and don't need labels.
  const allCoords = [...areas, ...nearResults.slice(0, shown)]
    .map((a) => a.metadata)
    .filter(
      (m): m is { lat: number; lng: number } =>
        m?.lat != null && m?.lng != null,
    )
    .map((m) => ({ lat: m.lat, lng: m.lng }));
  const locations = await resolveLocations(allCoords);

  function locationFor(meta: { lat?: number | null; lng?: number | null } | null | undefined) {
    if (meta?.lat == null || meta?.lng == null) return undefined;
    return locations.get(locationKey(meta.lat, meta.lng));
  }

  return (
    <main className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-stone-900 dark:text-stone-100 mb-2">
          Anchorpoint
        </h1>
        <p className="text-stone-600 dark:text-stone-400 mb-8">
          The open climbing database, reimagined.
        </p>

        <div
          role="tablist"
          aria-label="Search areas or routes"
          className="flex gap-2 mb-3"
        >
          {(["areas", "routes", "location"] as const).map((m) => {
            const active = activeTab === m;
            // Switching to Location drops any in-progress name query —
            // it'd otherwise be geocoded as a place, which is surprising.
            const tabQuery = m === "location" ? "" : query;
            return (
              <Link
                key={m}
                href={searchHref(
                  m,
                  tabQuery,
                  hasLocation ? userLat : null,
                  hasLocation ? userLng : null,
                )}
                role="tab"
                aria-selected={active}
                className={
                  active
                    ? "px-4 py-1.5 rounded-full text-sm bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium"
                    : "px-4 py-1.5 rounded-full text-sm border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                }
              >
                {m === "areas" ? "Areas" : m === "routes" ? "Routes" : "Location"}
              </Link>
            );
          })}
        </div>

        <form
          action=""
          method="GET"
          className="flex flex-col sm:flex-row gap-2 mb-8"
          role="search"
        >
          {/* Carry the current location through a search submission so
              the map keeps its pins instead of resetting to empty. */}
          {hasLocation && (
            <>
              <input type="hidden" name="lat" value={userLat} />
              <input type="hidden" name="lng" value={userLng} />
            </>
          )}
          {/* Keep the active tab through submission (areas is the default,
              so only routes / location need to be carried). */}
          {mode !== "areas" && (
            <input type="hidden" name="mode" value={mode} />
          )}
          {/* Carry the active discipline chips through a new search. */}
          {mode === "routes" && typeFilter.size > 0 && (
            <input
              type="hidden"
              name="type"
              value={Array.from(typeFilter).join(",")}
            />
          )}
          {/* Carry the active grade range through a new search. */}
          {mode === "routes" && gradeRange.ydsMin && (
            <input type="hidden" name="ydsMin" value={gradeRange.ydsMin} />
          )}
          {mode === "routes" && gradeRange.ydsMax && (
            <input type="hidden" name="ydsMax" value={gradeRange.ydsMax} />
          )}
          {mode === "routes" && gradeRange.vMin && (
            <input type="hidden" name="vMin" value={gradeRange.vMin} />
          )}
          {mode === "routes" && gradeRange.vMax && (
            <input type="hidden" name="vMax" value={gradeRange.vMax} />
          )}
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={
              mode === "routes"
                ? "Search routes (e.g. The Nose)"
                : mode === "location"
                  ? "City or place (e.g. Bend, OR)"
                  : "Search areas (e.g. Smith Rock)"
            }
            aria-label={
              mode === "routes"
                ? "Search routes"
                : mode === "location"
                  ? "Search by location"
                  : "Search climbing areas"
            }
            autoFocus
            className="flex-1 min-w-0 px-4 py-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent"
          />
          <button
            type="submit"
            className="w-full sm:w-auto px-6 py-3 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors"
          >
            Search
          </button>
        </form>

        {hasLocation && <LocationSync lat={userLat} lng={userLng} />}

        <NearMeButton />

        <NearMap
          userLat={hasLocation ? userLat : null}
          userLng={hasLocation ? userLng : null}
          // Map shows ALL pins in the radius (up to NEAR_MAX_SHOWN),
          // not just the paginated card slice — so zooming out reveals
          // the farther crags rather than empty rock.
          crags={nearResults
            .filter(
              (c) => c.metadata?.lat != null && c.metadata?.lng != null,
            )
            .map((c) => ({
              uuid: c.uuid,
              name: c.area_name,
              lat: c.metadata!.lat!,
              lng: c.metadata!.lng!,
              climbs: c.totalClimbs,
            }))}
        />

        {hasLocation && (
          <div className="mt-4">
            {/* Suspense lets the rest of the page paint instantly even
                if Open-Meteo is slow. */}
            <Suspense fallback={<WeatherSkeleton />}>
              <WeatherForecast lat={userLat} lng={userLng} />
            </Suspense>
          </div>
        )}

        {query ? (
          // Searching — show search results below the (still-populated)
          // map. Takes precedence over the near-me list.
          mode === "routes" ? (
            routeError ? (
              <ApiErrorBlock />
            ) : (
              <>
                <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-4">
                  {routes.length === 0
                    ? `No routes for "${query}"`
                    : `${routes.length === 50 ? "Top 50 routes" : `${routes.length} route${routes.length === 1 ? "" : "s"}`} in ${routeAreaCount} area${routeAreaCount === 1 ? "" : "s"} for "${query}"`}
                </h2>

                <TypeFilterChips
                  active={typeFilter}
                  hrefFor={(t) =>
                    routeTypeHref(
                      t,
                      query,
                      typeFilter,
                      gradeRange,
                      hasLocation ? userLat : null,
                      hasLocation ? userLng : null,
                    )
                  }
                  ariaLabel="Filter routes by type"
                />

                <form action="" method="GET" className="mb-4">
                  {/* Preserve everything else when the user changes
                      grade bounds and submits. */}
                  {query && <input type="hidden" name="q" value={query} />}
                  <input type="hidden" name="mode" value="routes" />
                  {typeFilter.size > 0 && (
                    <input
                      type="hidden"
                      name="type"
                      value={Array.from(typeFilter).join(",")}
                    />
                  )}
                  {hasLocation && (
                    <>
                      <input type="hidden" name="lat" value={userLat} />
                      <input type="hidden" name="lng" value={userLng} />
                    </>
                  )}
                  <GradeRangeFilter range={gradeRange} label="Grade range" />
                  <div className="text-right">
                    <button
                      type="submit"
                      className="text-sm px-4 py-1.5 rounded-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                </form>

                {routes.length === 0 ? (
                  <p className="text-stone-500 dark:text-stone-400">
                    Try a different spelling, or search{" "}
                    <Link
                      href={searchHref(
                        "areas",
                        query,
                        hasLocation ? userLat : null,
                        hasLocation ? userLng : null,
                      )}
                      className="underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
                    >
                      Areas
                    </Link>{" "}
                    instead.
                  </p>
                ) : (
                  <ClimbResultsGrouped climbs={routes} />
                )}
              </>
            )
          ) : mode === "location" ? (
            // Reached only when forward-geocoding failed (a success
            // redirects to the near-me view before render).
            <>
              <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-4">
                Couldn&apos;t find &ldquo;{query}&rdquo;
              </h2>
              <p className="text-stone-500 dark:text-stone-400">
                Try a city and state, like{" "}
                <Link
                  href={searchHref("location", "Bend, OR", null, null)}
                  className="underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
                >
                  Bend, OR
                </Link>
                . Or search by{" "}
                <Link
                  href={searchHref(
                    "areas",
                    query,
                    hasLocation ? userLat : null,
                    hasLocation ? userLng : null,
                  )}
                  className="underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
                >
                  area name
                </Link>{" "}
                instead.
              </p>
            </>
          ) : searchError ? (
            <ApiErrorBlock />
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-4">
                {areas.length > 0
                  ? `${areas.length} result${areas.length === 1 ? "" : "s"} for "${query}"`
                  : `No results for "${query}"`}
              </h2>

              {areas.length === 0 ? (
                <p className="text-stone-500 dark:text-stone-400">
                  Try a different search term, or check your spelling.
                </p>
              ) : (
                <div className="space-y-4">
                  {areas.map((area) => (
                    <AreaCard
                      key={area.uuid}
                      area={area}
                      location={locationFor(area.metadata)}
                    />
                  ))}
                </div>
              )}
            </>
          )
        ) : hasLocation ? (
          // No query but we have a location — the near-me list.
          nearError ? (
            <ApiErrorBlock />
          ) : (
            <>
              <NearResults
                results={nearResults.slice(0, shown)}
                locationFor={locationFor}
                placeLabel={placeLabel}
              />
              {nearResults.length > shown && (
                <div className="mt-6 text-center">
                  <Link
                    href={`/?lat=${userLat}&lng=${userLng}${
                      placeLabel
                        ? `&place=${encodeURIComponent(placeLabel)}`
                        : ""
                    }&shown=${Math.min(
                      shown + NEAR_PAGE_SIZE,
                      nearResults.length,
                    )}`}
                    scroll={false}
                    className="inline-block px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                  >
                    Show more
                  </Link>
                </div>
              )}
            </>
          )
        ) : (
          // No query, no location — the intro state.
          <>
            <BookmarksPreview />
            <TicksPreview />
            <p className="text-stone-500 dark:text-stone-400 text-center py-12">
              Search for an area to get started. Try{" "}
              <Link
                href="/?q=Smith+Rock"
                className="text-stone-900 dark:text-stone-100 underline underline-offset-4 hover:text-stone-700 dark:hover:text-stone-300"
              >
                Smith Rock
              </Link>
              ,{" "}
              <Link
                href="/?q=Joshua+Tree"
                className="text-stone-900 dark:text-stone-100 underline underline-offset-4 hover:text-stone-700 dark:hover:text-stone-300"
              >
                Joshua Tree
              </Link>
              , or{" "}
              <Link
                href="/?q=Red+Rocks"
                className="text-stone-900 dark:text-stone-100 underline underline-offset-4 hover:text-stone-700 dark:hover:text-stone-300"
              >
                Red Rocks
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </main>
  );
}

// Build a home-page URL for an Areas/Routes tab, preserving the current
// query and location so switching tabs (or submitting) keeps both. Areas
// is the default mode, so its links omit the `mode` param.
// Pull the user's near-me crags from OpenBeta. Returns an empty list
// (not an error) when no location is set; non-fatal on upstream error
// so the rest of the page still renders.
async function fetchNearResults(
  hasLocation: boolean,
  userLat: number | null,
  userLng: number | null,
): Promise<{ nearResults: NearCrag[]; nearError: boolean }> {
  if (!hasLocation || userLat === null || userLng === null) {
    return { nearResults: [], nearError: false };
  }
  try {
    let all: NearCrag[] = [];
    for (const miles of NEAR_RADII_MILES) {
      const result = await getClient().query<GetCragsNearResponse>({
        query: GET_CRAGS_NEAR,
        variables: {
          lat: userLat,
          lng: userLng,
          max: Math.round(miles * 1609.344),
        },
      });
      // Rebuild from scratch each tier — a wider radius is a superset,
      // so the latest result already contains every closer crag.
      all = [];
      for (const g of result.data?.cragsNear ?? []) {
        for (const c of g?.crags ?? []) {
          const cLat = c.metadata?.lat;
          const cLng = c.metadata?.lng;
          if (cLat == null || cLng == null) continue;
          all.push({
            ...c,
            distanceMiles: haversineMiles(
              { lat: userLat, lng: userLng },
              { lat: cLat, lng: cLng },
            ),
          });
        }
      }
      // Enough to fill the first page → no reason to widen (and pay the
      // bigger-radius latency). Otherwise expand to the next tier.
      if (all.length >= NEAR_INITIAL_SHOWN) break;
    }
    all.sort((a, b) => a.distanceMiles - b.distanceMiles);
    // Cap so a query point in a very dense region doesn't blow up the
    // page; the visible card list paginates further via `shown`.
    return { nearResults: all.slice(0, NEAR_MAX_SHOWN), nearError: false };
  } catch (err) {
    console.error("OpenBeta cragsNear query failed:", err);
    return { nearResults: [], nearError: true };
  }
}

// Run the active text-search against the right index for the tab.
// Areas mode → OpenBeta; routes mode → Supabase search_climbs RPC.
// Returns empty results (not an error) when no query is set.
async function fetchSearchResults(
  query: string,
  mode: "areas" | "routes" | "location",
  typeFilter: Set<string>,
  gradeRange: GradeRange,
): Promise<{
  areas: AreaCardData[];
  routes: ClimbResult[];
  searchError: boolean;
  routeError: boolean;
}> {
  // Location mode resolves via forward-geocode + redirect upstream; if
  // we reach here the geocode failed, so there's no name search to run.
  if (!query || mode === "location") {
    return { areas: [], routes: [], searchError: false, routeError: false };
  }
  if (mode === "areas") {
    try {
      const result = await getClient().query<GetAreasResponse>({
        query: GET_AREAS,
        variables: { query },
      });
      return {
        areas: result.data?.areas ?? [],
        routes: [],
        searchError: false,
        routeError: false,
      };
    } catch (err) {
      console.error("OpenBeta GraphQL query failed:", err);
      return { areas: [], routes: [], searchError: true, routeError: false };
    }
  }
  // routes mode
  try {
    const supabase = await createClient();
    const bounds = gradeRangeToBounds(gradeRange);
    const { data, error } = await supabase.rpc("search_climbs", {
      q: query,
      types: typeFilter.size > 0 ? Array.from(typeFilter) : null,
      yds_min: bounds.ydsMin,
      yds_max: bounds.ydsMax,
      v_min: bounds.vMin,
      v_max: bounds.vMax,
      max_results: 50,
    });
    if (error) throw error;
    return {
      areas: [],
      routes: (data ?? []) as ClimbResult[],
      searchError: false,
      routeError: false,
    };
  } catch (err) {
    console.error("Supabase route search failed:", err);
    return { areas: [], routes: [], searchError: false, routeError: true };
  }
}

function searchHref(
  mode: "areas" | "routes" | "location",
  query: string,
  userLat: number | null,
  userLng: number | null,
): string {
  const p = new URLSearchParams();
  if (query) p.set("q", query);
  // Always set mode — including "areas" — so a tab click is an explicit
  // choice the page can distinguish from a default location-anchored
  // view (which omits `mode`). Without this, clicking Areas while a
  // location is preserved looks identical to the near-me view and the
  // Location tab stays highlighted.
  p.set("mode", mode);
  if (userLat !== null && userLng !== null) {
    p.set("lat", String(userLat));
    p.set("lng", String(userLng));
  }
  return `/?${p.toString()}`;
}

// Build a Routes-tab URL with one discipline chip toggled on/off,
// preserving the query, grade range, and location. Always sets
// mode=routes since the chips only show there.
function routeTypeHref(
  toggle: string,
  query: string,
  active: Set<string>,
  gradeRange: GradeRange,
  userLat: number | null,
  userLng: number | null,
): string {
  const next = new Set(active);
  if (next.has(toggle)) next.delete(toggle);
  else next.add(toggle);
  const p = new URLSearchParams();
  if (query) p.set("q", query);
  p.set("mode", "routes");
  if (next.size > 0) p.set("type", Array.from(next).join(","));
  if (gradeRange.ydsMin) p.set("ydsMin", gradeRange.ydsMin);
  if (gradeRange.ydsMax) p.set("ydsMax", gradeRange.ydsMax);
  if (gradeRange.vMin) p.set("vMin", gradeRange.vMin);
  if (gradeRange.vMax) p.set("vMax", gradeRange.vMax);
  if (userLat !== null && userLng !== null) {
    p.set("lat", String(userLat));
    p.set("lng", String(userLng));
  }
  return `/?${p.toString()}`;
}

function parseCoord(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  // Reject NaN, infinity, and obviously-malformed values. Lat is bounded
  // to ±90, lng to ±180 — anything outside that came from a bad URL.
  if (!Number.isFinite(n) || Math.abs(n) > 180) return null;
  return n;
}

function ApiErrorBlock() {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-lg p-6 border border-stone-200 dark:border-stone-800">
      <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
        We couldn&apos;t reach the climbing database
      </h2>
      <p className="text-stone-600 dark:text-stone-400">
        The OpenBeta API didn&apos;t respond. This usually clears up in a
        moment — try again.
      </p>
    </div>
  );
}

function NearResults({
  results,
  locationFor,
  placeLabel,
}: {
  results: NearCrag[];
  locationFor: (
    meta: { lat?: number | null; lng?: number | null } | null | undefined,
  ) => string | undefined;
  // When set (a "climbs near <place>" search), names the place in the
  // heading and empty state; otherwise this is the GPS "near you" view.
  placeLabel?: string;
}) {
  const where = placeLabel ?? "you";
  if (results.length === 0) {
    return (
      <p className="text-stone-500 dark:text-stone-400">
        No climbing areas found near {where}. Try searching by name instead.
      </p>
    );
  }
  return (
    <>
      <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-4">
        Climbs near {where}
      </h2>
      <div className="space-y-4">
        {results.map((c) => (
          <AreaCard
            key={c.uuid}
            area={c}
            distanceMiles={c.distanceMiles}
            location={locationFor(c.metadata)}
          />
        ))}
      </div>
    </>
  );
}
