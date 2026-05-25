import Link from "next/link";
import { getClient } from "@/lib/apollo-client";
import { AreaCard, type AreaCardData } from "@/components/area-card";
import { NearMeButton } from "@/components/near-me-button";
import { BookmarksPreview } from "@/components/bookmarks-preview";
import { haversineMiles } from "@/lib/geo";
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

// 50 miles covers a generous driving range for "after-work crag near
// home" while keeping the result set manageable. Crags within this
// radius are sorted by true haversine distance from the query point.
// The API wants meters, so derive that from the displayed miles value
// to keep the two in sync.
const NEAR_RADIUS_MILES = 50;
const NEAR_RADIUS_METERS = Math.round(NEAR_RADIUS_MILES * 1609.344);
const NEAR_RESULT_LIMIT = 20;

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
  searchParams: Promise<{ q?: string; lat?: string; lng?: string }>;
}) {
  const { q, lat, lng } = await searchParams;
  const query = q?.trim() ?? "";

  // Geolocation mode wins over search if both happen to be set, since
  // lat/lng comes from the NearMeButton flow (explicit intent) while q
  // could be a stale URL.
  const userLat = parseCoord(lat);
  const userLng = parseCoord(lng);
  const nearMode = userLat !== null && userLng !== null;

  let areas: AreaCardData[] = [];
  let nearResults: NearCrag[] = [];
  let apiError = false;

  if (nearMode) {
    try {
      const result = await getClient().query<GetCragsNearResponse>({
        query: GET_CRAGS_NEAR,
        variables: {
          lat: userLat,
          lng: userLng,
          max: NEAR_RADIUS_METERS,
        },
      });
      const groups = result.data?.cragsNear ?? [];
      // Flatten all distance buckets, drop crags without coords, attach
      // a true haversine distance, sort nearest-first, and cap.
      const all: NearCrag[] = [];
      for (const g of groups) {
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
      all.sort((a, b) => a.distanceMiles - b.distanceMiles);
      nearResults = all.slice(0, NEAR_RESULT_LIMIT);
    } catch (err) {
      console.error("OpenBeta cragsNear query failed:", err);
      apiError = true;
    }
  } else if (query) {
    try {
      const result = await getClient().query<GetAreasResponse>({
        query: GET_AREAS,
        variables: { query },
      });
      areas = result.data?.areas ?? [];
    } catch (err) {
      console.error("OpenBeta GraphQL query failed:", err);
      apiError = true;
    }
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

        <form
          action=""
          method="GET"
          className="flex gap-2 mb-8"
          role="search"
        >
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search for a climbing area (e.g. Smith Rock, Joshua Tree)"
            aria-label="Search climbing areas"
            autoFocus
            className="flex-1 px-4 py-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-6 py-3 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors"
          >
            Search
          </button>
        </form>

        <NearMeButton />

        {nearMode ? (
          apiError ? (
            <ApiErrorBlock />
          ) : (
            <NearResults results={nearResults} />
          )
        ) : query === "" ? (
          <>
            <BookmarksPreview />
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
        ) : apiError ? (
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
                  <AreaCard key={area.uuid} area={area} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
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

function NearResults({ results }: { results: NearCrag[] }) {
  if (results.length === 0) {
    return (
      <p className="text-stone-500 dark:text-stone-400">
        No climbing areas within {NEAR_RADIUS_MILES} miles of you. Try
        searching by name.
      </p>
    );
  }
  return (
    <>
      <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-4">
        Nearest {results.length} climbing area
        {results.length === 1 ? "" : "s"}
      </h2>
      <div className="space-y-4">
        {results.map((c) => (
          <AreaCard key={c.uuid} area={c} distanceMiles={c.distanceMiles} />
        ))}
      </div>
    </>
  );
}
