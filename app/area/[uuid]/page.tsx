import { cache, Fragment, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { gql } from "@apollo/client";
import { getClient } from "@/lib/apollo-client";
import { AreaCard, type AreaCardData } from "@/components/area-card";
import { BookmarkButton } from "@/components/bookmark-button";
import { DirectionsButton } from "@/components/directions-button";
import { MapToggle } from "@/components/map-toggle";
import { SortDropdown } from "@/components/sort-dropdown";
import { Stars } from "@/components/stars";
import { TypeFilterChips } from "@/components/type-filter-chips";
import { WeatherForecast } from "@/components/weather-forecast";
import { WeatherSkeleton } from "@/components/weather-skeleton";
import { gradeToNumber } from "@/lib/grades";
import { coordsOf, haversineMiles } from "@/lib/geo";
import { parseTypeFilter } from "@/lib/climb-types";
import {
  climbInGradeRange,
  isGradeRangeActive,
  parseGradeRange,
  type GradeRange,
} from "@/lib/grade-options";
import { GradeRangeFilter } from "@/components/grade-range-filter";
import { locationKey, resolveLocations } from "@/lib/geocoding";
import { blendRating, type RatingSource } from "@/lib/ratings";
import { createClient } from "@/lib/supabase/server";

type Climb = {
  id: string;
  uuid: string;
  name: string;
  fa?: string | null;
  // OpenBeta uses a "SafetyEnum": UNSPECIFIED | PG | PG13 | runout | terrain | R | X.
  // Only R, X, and "runout" are worth surfacing — the rest are noise.
  safety?: string | null;
  type?: {
    sport?: boolean | null;
    trad?: boolean | null;
    bouldering?: boolean | null;
    tr?: boolean | null;
    mixed?: boolean | null;
    ice?: boolean | null;
    aid?: boolean | null;
    alpine?: boolean | null;
    deepwatersolo?: boolean | null;
  } | null;
  pitches?: { id: string }[] | null;
  ticks?: { _id: string }[] | null;
  grades?: { yds?: string | null; vscale?: string | null } | null;
};

type AreaDetail = {
  uuid: string;
  area_name: string;
  totalClimbs: number;
  pathTokens: string[];
  ancestors: string[];
  metadata?: { lat?: number | null; lng?: number | null } | null;
  children: AreaCardData[];
  climbs: Climb[];
};

type GetAreaResponse = {
  area: AreaDetail | null;
};

const GET_AREA = gql`
  query GetArea($uuid: ID!) {
    area(uuid: $uuid) {
      uuid
      area_name
      totalClimbs
      pathTokens
      ancestors
      metadata {
        lat
        lng
      }
      children {
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
      climbs {
        id
        uuid
        name
        fa
        safety
        type {
          sport
          trad
          bouldering
          tr
          mixed
          ice
          aid
          alpine
          deepwatersolo
        }
        pitches {
          id
        }
        ticks {
          _id
        }
        grades {
          yds
          vscale
        }
      }
    }
  }
`;

// React.cache() de-duplicates calls with the same args across a single
// request. Next renders generateMetadata + the page tree concurrently,
// so without this both could hit OpenBeta on a cold cache. Apollo's
// per-request InMemoryCache dedupes within one render pass but not
// across two parallel ones.
const fetchArea = cache(async (uuid: string) => {
  // errorPolicy "all" so a "not found" GraphQL error returns
  // `data.area: null` instead of throwing — the page-render path wants
  // to show a proper 404-style UI in that case, not the generic
  // API-down UI.
  try {
    const result = await getClient().query<GetAreaResponse>({
      query: GET_AREA,
      variables: { uuid },
      errorPolicy: "all",
    });
    return { area: result.data?.area ?? null, apiError: false };
  } catch (err) {
    console.error("OpenBeta GraphQL query failed:", err);
    return { area: null, apiError: true };
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uuid: string }>;
}): Promise<Metadata> {
  const { uuid } = await params;
  const { area } = await fetchArea(uuid);
  const name = area?.area_name;
  if (name) {
    return {
      title: `${name} · Anchorpoint`,
      description: `Climbing area: ${name}`,
    };
  }
  return {};
}

export default async function AreaPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{
    route?: string;
    type?: string;
    ydsMin?: string;
    ydsMax?: string;
    vMin?: string;
    vMax?: string;
    sort?: string;
  }>;
}) {
  const { uuid } = await params;
  const sp = await searchParams;
  const { route, type } = sp;
  const gradeRange = parseGradeRange(sp);
  const sortMode = parseSortMode(sp.sort);
  const routeFilter = route?.trim() ?? "";
  const typeFilter = parseTypeFilter(type);

  // Shared with generateMetadata via React.cache so cold-cache visits
  // pay one OpenBeta round-trip, not two.
  const { area, apiError } = await fetchArea(uuid);

  // Batch-resolve City/State labels for the area itself + every child
  // card in a single Mapbox/cache pass.
  const coordsToResolve: { lat: number; lng: number }[] = [];
  if (area?.metadata?.lat != null && area.metadata.lng != null) {
    coordsToResolve.push({ lat: area.metadata.lat, lng: area.metadata.lng });
  }
  for (const child of area?.children ?? []) {
    if (child.metadata?.lat != null && child.metadata.lng != null) {
      coordsToResolve.push({
        lat: child.metadata.lat,
        lng: child.metadata.lng,
      });
    }
  }
  // Geocoding + ratings are independent — both need data from the
  // already-resolved area but neither needs the other. Run them in
  // parallel so we pay one network round-trip's latency, not two.
  const climbUuids = area?.climbs?.map((c) => c.uuid) ?? [];
  const [locations, ratings] = await Promise.all([
    resolveLocations(coordsToResolve),
    fetchAreaRatings(climbUuids),
  ]);
  function locationFor(
    meta: { lat?: number | null; lng?: number | null } | null | undefined,
  ) {
    if (meta?.lat == null || meta?.lng == null) return undefined;
    return locations.get(locationKey(meta.lat, meta.lng));
  }
  return (
    <main className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/"
          className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
        >
          ← Search
        </Link>

        {apiError ? (
          <div className="mt-6 bg-white dark:bg-stone-900 rounded-lg p-6 border border-stone-200 dark:border-stone-800">
            <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
              We couldn&apos;t reach the climbing database
            </h2>
            <p className="text-stone-600 dark:text-stone-400">
              The OpenBeta API didn&apos;t respond. This usually clears up in
              a moment — try again.
            </p>
          </div>
        ) : !area ? (
          <div className="mt-6">
            <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
              Area not found
            </h1>
            <p className="text-stone-600 dark:text-stone-400 mt-2">
              No area exists with that ID.
            </p>
          </div>
        ) : (
          <>
            <Breadcrumbs
              pathTokens={area.pathTokens}
              ancestors={area.ancestors}
            />

            <div className="flex items-start justify-between gap-4 mt-2 mb-1">
              <h1 className="text-4xl font-bold text-stone-900 dark:text-stone-100">
                {area.area_name}
              </h1>
              <div className="pt-2">
                <BookmarkButton
                  type="area"
                  uuid={area.uuid}
                  name={area.area_name}
                  // Full area payload — written to IndexedDB on save so
                  // the page can be rebuilt offline from this snapshot.
                  snapshot={area}
                />
              </div>
            </div>
            <p className="text-stone-600 dark:text-stone-400 mb-8">
              {area.totalClimbs > 0
                ? `${area.totalClimbs} climb${area.totalClimbs === 1 ? "" : "s"}`
                : "No climbs recorded"}
              {(() => {
                const loc = locationFor(area.metadata);
                const hasCoords =
                  area.metadata?.lat != null && area.metadata?.lng != null;
                if (!loc && !hasCoords) return null;
                return (
                  <>
                    {" · "}
                    {loc ??
                      `${area.metadata!.lat!.toFixed(4)}, ${area.metadata!.lng!.toFixed(4)}`}
                  </>
                );
              })()}
            </p>

            {isMainCragForWeather(area) && (
              <Suspense fallback={<WeatherSkeleton />}>
                <WeatherForecast
                  lat={area.metadata?.lat}
                  lng={area.metadata?.lng}
                />
              </Suspense>
            )}

            {area.metadata?.lat != null && area.metadata?.lng != null && (
              <div className="mb-3">
                <DirectionsButton
                  lat={area.metadata.lat}
                  lng={area.metadata.lng}
                />
              </div>
            )}

            <AreaMap area={area} />

            {area.children.length > 0 && (
              <section className="mb-10">
                <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-4">
                  Sub-areas ({area.children.length})
                </h2>
                <div className="space-y-4">
                  {sortChildren(area.children).map((child) => (
                    <AreaCard
                      key={child.uuid}
                      area={child}
                      location={locationFor(child.metadata)}
                    />
                  ))}
                </div>
              </section>
            )}

            {area.climbs.length > 0 && (
              <ClimbsSection
                uuid={uuid}
                climbs={area.climbs}
                filter={routeFilter}
                typeFilter={typeFilter}
                gradeRange={gradeRange}
                sortMode={sortMode}
                ratings={ratings}
              />
            )}

            {area.children.length === 0 && area.climbs.length === 0 && (
              <p className="text-stone-500 dark:text-stone-400">
                This area has no sub-areas or climbs recorded.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/**
 * Decide whether to render the weather card on this area page. We want
 * it on "main crags" (Smith Rock, Joshua Tree, …) but NOT on:
 *   - sub-areas / specific walls (forecast would just repeat the crag's),
 *   - regional containers like "Central Oregon" whose coords are a
 *     state-region centroid, not a real climbing spot.
 *
 * OpenBeta doesn't tag areas as "crag" vs "container", so we infer it:
 *
 *   1. Path depth 3–4 — covers the typical "USA → State → Crag" and
 *      "USA → State → Region → Crag" patterns. Excludes country/state
 *      pages (depth ≤ 2) and most sub-areas (depth ≥ 5).
 *   2. Has sub-area children — required so we can run check 3.
 *   3. All children's coords cluster within ~10 km of the area itself —
 *      this is what separates a crag (sub-walls a short walk apart)
 *      from a region (sub-crags scattered across hundreds of miles).
 *
 * Edge cases: tiny single-wall crags with no sub-areas, and main crags
 * whose children all have missing coords, both fall through to "no
 * weather". Acceptable for now; user can navigate up if needed.
 */
/**
 * Bulk-fetch curated + UGC star ratings for every climb in an area in
 * one Supabase round-trip. Non-fatal: if Supabase is unreachable or a
 * climb isn't in the index we just return an empty Map and the badge
 * won't render for those rows.
 */
async function fetchAreaRatings(
  climbUuids: string[],
): Promise<Map<string, RatingSource>> {
  const out = new Map<string, RatingSource>();
  if (climbUuids.length === 0) return out;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("climbs_index")
      .select("uuid, curated_stars, curated_votes, ugc_stars, ugc_votes")
      .in("uuid", climbUuids);
    if (error) throw error;
    for (const r of data ?? []) {
      out.set(r.uuid, {
        curated_stars: r.curated_stars,
        curated_votes: r.curated_votes,
        ugc_stars: r.ugc_stars,
        ugc_votes: r.ugc_votes,
      });
    }
  } catch (err) {
    console.error("Ratings fetch failed (non-fatal):", err);
  }
  return out;
}

function isMainCragForWeather(area: AreaDetail): boolean {
  if (area.pathTokens.length < 3 || area.pathTokens.length > 4) return false;
  const own = coordsOf(area.metadata);
  if (!own) return false;
  if (area.children.length === 0) return false;
  let validChildren = 0;
  for (const child of area.children) {
    const childCoords = coordsOf(child.metadata);
    if (!childCoords) continue;
    validChildren++;
    // ~10 km in miles. Sub-walls of a single crag fit comfortably under
    // this; regional containers (state-region → many crags) don't.
    if (haversineMiles(own, childCoords) > 6.2) return false;
  }
  return validChildren > 0;
}

function AreaMap({ area }: { area: AreaDetail }) {
  // Prefer pins for the sub-areas — that's the useful "what's around
  // here" view. Fall back to a single pin for the area itself when it
  // has no children with coords (e.g. a leaf crag with only climbs).
  const childCrags = area.children
    .map((c) => {
      const co = coordsOf(c.metadata);
      return co
        ? {
            uuid: c.uuid,
            name: c.area_name,
            lat: co.lat,
            lng: co.lng,
            climbs: c.totalClimbs,
          }
        : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const areaCoords = coordsOf(area.metadata);
  const mapCrags =
    childCrags.length > 0
      ? childCrags
      : areaCoords
        ? [
            {
              uuid: area.uuid,
              name: area.area_name,
              lat: areaCoords.lat,
              lng: areaCoords.lng,
              climbs: area.totalClimbs,
            },
          ]
        : [];

  if (mapCrags.length === 0) return null;

  return (
    <div className="mb-8">
      <MapToggle crags={mapCrags} fitMode="all" />
    </div>
  );
}

function Breadcrumbs({
  pathTokens,
  ancestors,
}: {
  pathTokens: string[];
  ancestors: string[];
}) {
  // pathTokens and ancestors are parallel arrays from root to the current
  // area. The last entry is the current area — render it as plain text,
  // everything before it as a link.
  if (pathTokens.length <= 1) return null;
  return (
    <nav
      aria-label="Breadcrumbs"
      className="mt-4 text-sm text-stone-500 dark:text-stone-400"
    >
      {pathTokens.slice(0, -1).map((name, i) => (
        <span key={ancestors[i] ?? i}>
          <Link
            href={`/area/${ancestors[i]}`}
            className="hover:text-stone-900 dark:hover:text-stone-100"
          >
            {name}
          </Link>
          <span className="mx-2">/</span>
        </span>
      ))}
      <span className="text-stone-700 dark:text-stone-300">
        {pathTokens[pathTokens.length - 1]}
      </span>
    </nav>
  );
}

function sortChildren(children: AreaCardData[]): AreaCardData[] {
  // Most-climbed first, then alphabetical for ties — gives users the
  // popular crags up top instead of whatever order the API returned.
  return [...children].sort((a, b) => {
    if (b.totalClimbs !== a.totalClimbs) return b.totalClimbs - a.totalClimbs;
    return a.area_name.localeCompare(b.area_name);
  });
}

function climbMatchesTypeFilter(climb: Climb, active: Set<string>): boolean {
  if (active.size === 0) return true;
  const t = climb.type;
  if (!t) return false;
  // OR across selected types — a climb shows if ANY of its types
  // matches one of the picked chips.
  if (active.has("sport") && t.sport) return true;
  if (active.has("trad") && t.trad) return true;
  if (active.has("bouldering") && t.bouldering) return true;
  if (active.has("tr") && t.tr) return true;
  if (active.has("mixed") && t.mixed) return true;
  if (active.has("ice") && t.ice) return true;
  if (active.has("aid") && t.aid) return true;
  if (active.has("alpine") && t.alpine) return true;
  if (active.has("deepwatersolo") && t.deepwatersolo) return true;
  return false;
}

function ClimbsSection({
  uuid,
  climbs,
  filter,
  typeFilter,
  gradeRange,
  sortMode,
  ratings,
}: {
  uuid: string;
  climbs: Climb[];
  filter: string;
  typeFilter: Set<string>;
  gradeRange: GradeRange;
  sortMode: SortMode;
  ratings: Map<string, RatingSource>;
}) {
  const gradeActive = isGradeRangeActive(gradeRange);
  const matches = climbs.filter((c) => {
    if (filter && !c.name.toLowerCase().includes(filter.toLowerCase())) {
      return false;
    }
    if (!climbMatchesTypeFilter(c, typeFilter)) return false;
    if (gradeActive) {
      return climbInGradeRange(
        {
          yds: c.grades?.yds,
          vscale: c.grades?.vscale,
          bouldering: !!c.type?.bouldering,
        },
        gradeRange,
      );
    }
    return true;
  });

  const hasAnyFilter = filter !== "" || typeFilter.size > 0 || gradeActive;
  const heading = hasAnyFilter
    ? `Climbs (${matches.length} of ${climbs.length})`
    : `Climbs (${climbs.length})`;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 mb-4 flex-wrap">
        <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200">
          {heading}
        </h2>
        <SortToggle
          uuid={uuid}
          active={sortMode}
          routeFilter={filter}
          typeFilter={typeFilter}
          gradeRange={gradeRange}
        />
      </div>
      <TypeFilter
        uuid={uuid}
        routeFilter={filter}
        active={typeFilter}
        gradeRange={gradeRange}
        sortMode={sortMode}
      />
      <form action="" method="GET" role="search" className="mb-4 space-y-3">
        {/* Carry the current type selection + sort through a
            route-name submission so applying both filters works
            without manual URL-merging. */}
        {typeFilter.size > 0 && (
          <input
            type="hidden"
            name="type"
            value={Array.from(typeFilter).join(",")}
          />
        )}
        {sortMode === "popular" && (
          <input type="hidden" name="sort" value="popular" />
        )}
        <input
          type="search"
          name="route"
          defaultValue={filter}
          placeholder="Filter routes by name"
          aria-label="Filter routes by name"
          className="w-full px-4 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent"
        />
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
      {matches.length === 0 ? (
        <p className="text-stone-500 dark:text-stone-400">
          No climbs match the current filters.{" "}
          <Link
            href={`/area/${uuid}`}
            className="underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
          >
            Show all
          </Link>
        </p>
      ) : (
        <ul className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 divide-y divide-stone-200 dark:divide-stone-800">
          {sortClimbs(matches, sortMode).map((climb) => (
            <ClimbRow
              key={climb.id}
              climb={climb}
              rating={ratings.get(climb.uuid)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function TypeFilter({
  uuid,
  routeFilter,
  active,
  gradeRange,
  sortMode,
}: {
  uuid: string;
  routeFilter: string;
  active: Set<string>;
  gradeRange: GradeRange;
  sortMode: SortMode;
}) {
  function hrefFor(toggle: string): string {
    // Toggle this chip's value in/out of the active set, then rebuild
    // the URL preserving every other filter param.
    const next = new Set(active);
    if (next.has(toggle)) next.delete(toggle);
    else next.add(toggle);
    return buildClimbsHref(uuid, {
      routeFilter,
      typeFilter: next,
      gradeRange,
      sortMode,
    });
  }

  return (
    <TypeFilterChips
      active={active}
      hrefFor={hrefFor}
      ariaLabel="Filter routes by type"
    />
  );
}

/**
 * Sort-mode picker. Two modes: Grade (the existing default — easiest
 * first) and Popular (most ticks first, ties break by grade). Lives
 * next to the section heading.
 *
 * On phones this is a chevron dropdown (matching the weather card's
 * native `<details>` disclosure) so it stays compact in the heading
 * row; desktop keeps the inline chips. Both are no-JS: the dropdown is
 * a `<details>` popover and each option is a `<Link>` that carries the
 * `sort` query param.
 */
function SortToggle({
  uuid,
  active,
  routeFilter,
  typeFilter,
  gradeRange,
}: {
  uuid: string;
  active: SortMode;
  routeFilter: string;
  typeFilter: Set<string>;
  gradeRange: GradeRange;
}) {
  function hrefFor(mode: SortMode): string {
    return buildClimbsHref(uuid, {
      routeFilter,
      typeFilter,
      gradeRange,
      sortMode: mode,
    });
  }
  const MODES: { value: SortMode; label: string }[] = [
    { value: "grade", label: "Grade" },
    { value: "popular", label: "Popular" },
  ];
  const activeLabel =
    MODES.find((m) => m.value === active)?.label ?? MODES[0].label;
  return (
    <>
      {/* Mobile: chevron dropdown, styled after the weather card */}
      <SortDropdown
        activeLabel={activeLabel}
        options={MODES.map((m) => ({
          label: m.label,
          href: hrefFor(m.value),
          isActive: active === m.value,
        }))}
      />

      {/* Desktop: inline chips */}
      <div className="hidden sm:flex items-baseline gap-2 text-sm text-stone-500 dark:text-stone-400">
        <span aria-hidden>Sort:</span>
        <div role="group" aria-label="Sort climbs" className="flex gap-1">
          {MODES.map((m) => {
            const isActive = active === m.value;
            return (
              <Link
                key={m.value}
                href={hrefFor(m.value)}
                aria-pressed={isActive}
                className={
                  isActive
                    ? "px-2 py-0.5 rounded-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-medium"
                    : "px-2 py-0.5 rounded-full text-xs hover:text-stone-900 dark:hover:text-stone-100 underline underline-offset-4"
                }
              >
                {m.label}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

/**
 * Single source of truth for /area/<uuid> URLs that need to preserve
 * the climb-list filter + sort state.
 */
function buildClimbsHref(
  uuid: string,
  {
    routeFilter,
    typeFilter,
    gradeRange,
    sortMode,
  }: {
    routeFilter: string;
    typeFilter: Set<string>;
    gradeRange: GradeRange;
    sortMode: SortMode;
  },
): string {
  const params = new URLSearchParams();
  if (routeFilter) params.set("route", routeFilter);
  if (typeFilter.size > 0) params.set("type", Array.from(typeFilter).join(","));
  if (gradeRange.ydsMin) params.set("ydsMin", gradeRange.ydsMin);
  if (gradeRange.ydsMax) params.set("ydsMax", gradeRange.ydsMax);
  if (gradeRange.vMin) params.set("vMin", gradeRange.vMin);
  if (gradeRange.vMax) params.set("vMax", gradeRange.vMax);
  if (sortMode === "popular") params.set("sort", "popular");
  const qs = params.toString();
  return `/area/${uuid}${qs ? `?${qs}` : ""}`;
}

function ClimbRow({
  climb,
  rating,
}: {
  climb: Climb;
  rating: RatingSource | undefined;
}) {
  const grade = climb.grades?.yds ?? climb.grades?.vscale ?? "—";
  const blended = rating ? blendRating(rating) : null;
  const type = formatClimbType(climb.type);
  const pitchCount = climb.pitches?.length ?? 0;
  // R/X are the danger ratings climbers actually care about. "runout" is
  // a free-form severity that also matters; PG/PG13/UNSPECIFIED don't.
  const danger =
    climb.safety === "R" || climb.safety === "X" || climb.safety === "runout"
      ? climb.safety === "runout"
        ? "Runout"
        : climb.safety
      : null;
  const tickCount = climb.ticks?.length ?? 0;
  const fa = climb.fa?.trim();

  // Assemble meta as JSX nodes joined by " · " so the safety badge can
  // keep its own styling. Order: route attributes first, then provenance,
  // then popularity signal last.
  const parts: React.ReactNode[] = [];
  if (type) parts.push(type);
  if (pitchCount > 1) parts.push(`${pitchCount} pitches`);
  if (danger) {
    parts.push(
      <span className="font-semibold text-red-700 dark:text-red-400">
        {danger}
      </span>,
    );
  }
  if (fa) parts.push(`FA: ${fa}`);
  if (tickCount > 0) {
    parts.push(`${tickCount} tick${tickCount === 1 ? "" : "s"}`);
  }

  return (
    <li>
      <Link
        href={`/climb/${climb.uuid}`}
        className="block px-6 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-stone-900 dark:text-stone-100">
            {climb.name}
          </span>
          <span className="flex items-baseline gap-3 shrink-0">
            {blended && <Stars {...blended} />}
            <span className="text-sm text-stone-500 dark:text-stone-400 font-mono">
              {grade}
            </span>
          </span>
        </div>
        {parts.length > 0 && (
          <div className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            {parts.map((p, i) => (
              <Fragment key={i}>
                {i > 0 && " · "}
                {p}
              </Fragment>
            ))}
          </div>
        )}
      </Link>
    </li>
  );
}

function formatClimbType(type: Climb["type"]): string | null {
  if (!type) return null;
  // Sport-first ordering — at every crag I sampled, sport routes outnumber
  // the others, so listing it first reads naturally. Order after that
  // roughly tracks frequency: trad, bouldering, TR, then the rare types.
  const labels: string[] = [];
  if (type.sport) labels.push("Sport");
  if (type.trad) labels.push("Trad");
  if (type.bouldering) labels.push("Boulder");
  if (type.tr) labels.push("TR");
  if (type.mixed) labels.push("Mixed");
  if (type.ice) labels.push("Ice");
  if (type.aid) labels.push("Aid");
  if (type.alpine) labels.push("Alpine");
  if (type.deepwatersolo) labels.push("DWS");
  return labels.length > 0 ? labels.join("/") : null;
}

type SortMode = "grade" | "popular";

function parseSortMode(raw: string | undefined): SortMode {
  return raw === "popular" ? "popular" : "grade";
}

function sortClimbs(climbs: Climb[], mode: SortMode): Climb[] {
  if (mode === "popular") {
    // Most ticks first. Ties (very common — most climbs have 0 ticks)
    // fall through to YDS grade order so the within-tier list still
    // reads top-down by difficulty.
    return [...climbs].sort((a, b) => {
      const ta = a.ticks?.length ?? 0;
      const tb = b.ticks?.length ?? 0;
      if (tb !== ta) return tb - ta;
      const ag = a.grades?.yds ? gradeToNumber(a.grades.yds) : null;
      const bg = b.grades?.yds ? gradeToNumber(b.grades.yds) : null;
      if (ag === null && bg === null) return 0;
      if (ag === null) return 1;
      if (bg === null) return -1;
      return ag - bg;
    });
  }
  // Default: easiest first by YDS grade number; unparseable grades
  // (V-grades, etc.) sort to the end and keep their original order.
  return [...climbs].sort((a, b) => {
    const ag = a.grades?.yds ? gradeToNumber(a.grades.yds) : null;
    const bg = b.grades?.yds ? gradeToNumber(b.grades.yds) : null;
    if (ag === null && bg === null) return 0;
    if (ag === null) return 1;
    if (bg === null) return -1;
    return ag - bg;
  });
}
