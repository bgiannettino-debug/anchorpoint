import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { gql } from "@apollo/client";
import { getClient } from "@/lib/apollo-client";
import { AreaCard, type AreaCardData } from "@/components/area-card";
import { gradeToNumber } from "@/lib/grades";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uuid: string }>;
}): Promise<Metadata> {
  const { uuid } = await params;
  // Reuses the same query as the page render — Apollo's per-request
  // InMemoryCache dedupes this, so we don't pay for a second network call.
  try {
    const result = await getClient().query<GetAreaResponse>({
      query: GET_AREA,
      variables: { uuid },
      errorPolicy: "all",
    });
    const name = result.data?.area?.area_name;
    if (name) {
      return {
        title: `${name} · Anchorpoint`,
        description: `Climbing area: ${name}`,
      };
    }
  } catch {
    // Fall through to default metadata on API failure.
  }
  return {};
}

export default async function AreaPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ route?: string }>;
}) {
  const { uuid } = await params;
  const { route } = await searchParams;
  const routeFilter = route?.trim() ?? "";

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
              <ClimbsSection
                uuid={uuid}
                climbs={area.climbs}
                filter={routeFilter}
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

function ClimbsSection({
  uuid,
  climbs,
  filter,
}: {
  uuid: string;
  climbs: Climb[];
  filter: string;
}) {
  const matches = filter
    ? climbs.filter((c) =>
        c.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : climbs;
  const heading = filter
    ? `Climbs (${matches.length} of ${climbs.length} matching "${filter}")`
    : `Climbs (${climbs.length})`;

  return (
    <section>
      <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-4">
        {heading}
      </h2>
      <form action="" method="GET" role="search" className="mb-4">
        <input
          type="search"
          name="route"
          defaultValue={filter}
          placeholder="Filter routes by name"
          aria-label="Filter routes by name"
          className="w-full px-4 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent"
        />
      </form>
      {matches.length === 0 ? (
        <p className="text-stone-500 dark:text-stone-400">
          No climbs match &quot;{filter}&quot;.{" "}
          <Link
            href={`/area/${uuid}`}
            className="underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
          >
            Show all
          </Link>
        </p>
      ) : (
        <ul className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 divide-y divide-stone-200 dark:divide-stone-800">
          {sortClimbs(matches).map((climb) => (
            <ClimbRow key={climb.id} climb={climb} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ClimbRow({ climb }: { climb: Climb }) {
  const grade = climb.grades?.yds ?? climb.grades?.vscale ?? "—";
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
          <span className="text-sm text-stone-500 dark:text-stone-400 font-mono shrink-0">
            {grade}
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
