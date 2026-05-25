import Link from "next/link";
import { getClient } from "@/lib/apollo-client";
import { AreaCard, type AreaCardData } from "@/components/area-card";
import { gql } from "@apollo/client";

type GetAreasResponse = {
  areas: AreaCardData[];
};

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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  // Skip the API call for empty or one-character queries — a single
  // letter returns a huge, useless result set from OpenBeta. The form's
  // `minLength={2}` blocks this from normal submissions; this guard
  // covers manually-edited URLs like `/?q=a`.
  let areas: AreaCardData[] = [];
  let apiError = false;
  if (query.length >= 2) {
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
            minLength={2}
            placeholder="Search for a climbing area (e.g. Smith Rock, Joshua Tree)"
            aria-label="Search climbing areas (minimum 2 characters)"
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

        {query.length < 2 ? (
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
        ) : apiError ? (
          <div className="bg-white dark:bg-stone-900 rounded-lg p-6 border border-stone-200 dark:border-stone-800">
            <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
              We couldn&apos;t reach the climbing database
            </h2>
            <p className="text-stone-600 dark:text-stone-400">
              The OpenBeta API didn&apos;t respond. This usually clears up in
              a moment — try your search again.
            </p>
          </div>
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
