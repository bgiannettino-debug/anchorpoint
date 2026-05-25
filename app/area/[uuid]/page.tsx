import Link from "next/link";
import { gql } from "@apollo/client";
import { getClient } from "@/lib/apollo-client";
import { AreaCard, type AreaCardData } from "@/components/area-card";
import { gradeToNumber } from "@/lib/grades";

type Climb = {
  id: string;
  name: string;
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
        name
        grades {
          yds
          vscale
        }
      }
    }
  }
`;

export default async function AreaPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;

  let area: AreaDetail | null = null;
  let apiError = false;
  try {
    // errorPolicy "all" so a "not found" GraphQL error returns
    // `data.area: null` instead of throwing — we want to render a
    // proper 404-style UI in that case, not the generic API-down UI.
    const result = await getClient().query<GetAreaResponse>({
      query: GET_AREA,
      variables: { uuid },
      errorPolicy: "all",
    });
    area = result.data?.area ?? null;
  } catch (err) {
    console.error("OpenBeta GraphQL query failed:", err);
    apiError = true;
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

            <h1 className="text-4xl font-bold text-stone-900 dark:text-stone-100 mt-2 mb-1">
              {area.area_name}
            </h1>
            <p className="text-stone-600 dark:text-stone-400 mb-8">
              {area.totalClimbs > 0
                ? `${area.totalClimbs} climb${area.totalClimbs === 1 ? "" : "s"}`
                : "No climbs recorded"}
              {area.metadata?.lat != null && area.metadata?.lng != null && (
                <>
                  {" · "}
                  {area.metadata.lat.toFixed(4)},{" "}
                  {area.metadata.lng.toFixed(4)}
                </>
              )}
            </p>

            {area.children.length > 0 && (
              <section className="mb-10">
                <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-4">
                  Sub-areas ({area.children.length})
                </h2>
                <div className="space-y-4">
                  {sortChildren(area.children).map((child) => (
                    <AreaCard key={child.uuid} area={child} />
                  ))}
                </div>
              </section>
            )}

            {area.climbs.length > 0 && (
              <section>
                <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-4">
                  Climbs ({area.climbs.length})
                </h2>
                <ul className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 divide-y divide-stone-200 dark:divide-stone-800">
                  {sortClimbs(area.climbs).map((climb) => (
                    <li
                      key={climb.id}
                      className="flex items-baseline justify-between px-6 py-3"
                    >
                      <span className="text-stone-900 dark:text-stone-100">
                        {climb.name}
                      </span>
                      <span className="text-sm text-stone-500 dark:text-stone-400 font-mono">
                        {climb.grades?.yds ?? climb.grades?.vscale ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
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

function sortClimbs(climbs: Climb[]): Climb[] {
  // Easiest first by YDS grade number; unparseable grades (V-grades,
  // etc.) sort to the end and keep their original relative order.
  return [...climbs].sort((a, b) => {
    const ag = a.grades?.yds ? gradeToNumber(a.grades.yds) : null;
    const bg = b.grades?.yds ? gradeToNumber(b.grades.yds) : null;
    if (ag === null && bg === null) return 0;
    if (ag === null) return 1;
    if (bg === null) return -1;
    return ag - bg;
  });
}
