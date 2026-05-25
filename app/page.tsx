import { getClient } from "@/lib/apollo-client";
import { formatGradeRange } from "@/lib/grades";
import { gql } from "@apollo/client";

type Climb = {
  id: string;
  name: string;
  grades?: { yds?: string | null } | null;
};

type Area = {
  uuid: string;
  area_name: string;
  metadata?: { lat?: number | null; lng?: number | null } | null;
  climbs?: Climb[] | null;
};

type GetAreasResponse = {
  areas: Area[];
};

const GET_AREAS = gql`
  query GetAreas($query: String!) {
    areas(filter: { area_name: { match: $query, exactMatch: false } }) {
      uuid
      area_name
      metadata {
        lat
        lng
      }
      climbs {
        id
        name
        grades {
          yds
        }
      }
    }
  }
`;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  // Only run the GraphQL query if the user has searched for something.
  // No point hitting the API with an empty string on first page load.
  const areas: Area[] = query
    ? (
        await getClient().query<GetAreasResponse>({
          query: GET_AREAS,
          variables: { query },
        })
      ).data?.areas ?? []
    : [];

  return (
    <main className="min-h-screen bg-stone-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-stone-900 mb-2">Anchorpoint</h1>
        <p className="text-stone-600 mb-8">
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
            className="flex-1 px-4 py-3 rounded-lg border border-stone-300 bg-white text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-700 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-6 py-3 rounded-lg bg-stone-900 text-white font-medium hover:bg-stone-800 transition-colors"
          >
            Search
          </button>
        </form>

        {query === "" ? (
          <p className="text-stone-500 text-center py-12">
            Search for an area to get started. Try{" "}
            <a
              href="/?q=Smith+Rock"
              className="text-stone-900 underline underline-offset-4 hover:text-stone-700"
            >
              Smith Rock
            </a>
            ,{" "}
            <a
              href="/?q=Joshua+Tree"
              className="text-stone-900 underline underline-offset-4 hover:text-stone-700"
            >
              Joshua Tree
            </a>
            , or{" "}
            <a
              href="/?q=Red+Rocks"
              className="text-stone-900 underline underline-offset-4 hover:text-stone-700"
            >
              Red Rocks
            </a>
            .
          </p>
        ) : (
          <>
            <h2 className="text-2xl font-semibold text-stone-800 mb-4">
              {areas.length > 0
                ? `${areas.length} result${areas.length === 1 ? "" : "s"} for "${query}"`
                : `No results for "${query}"`}
            </h2>

            {areas.length === 0 ? (
              <p className="text-stone-500">
                Try a different search term, or check your spelling.
              </p>
            ) : (
              <div className="space-y-4">
                {areas.map((area) => (
                  <div
                    key={area.uuid}
                    className="bg-white rounded-lg shadow-sm p-6 border border-stone-200"
                  >
                    <h3 className="text-xl font-semibold text-stone-900">
                      {area.area_name}
                    </h3>
                    {area.metadata?.lat != null &&
                      area.metadata?.lng != null && (
                        <p className="text-sm text-stone-500 mt-1">
                          {area.metadata.lat.toFixed(4)},{" "}
                          {area.metadata.lng.toFixed(4)}
                        </p>
                      )}
                    {area.climbs && area.climbs.length > 0 && (
                      <p className="text-sm text-stone-600 mt-2">
                        {(() => {
                          const range = formatGradeRange(area.climbs);
                          const count = `${area.climbs.length} climb${area.climbs.length === 1 ? "" : "s"}`;
                          return range ? `${range} · ${count}` : count;
                        })()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
