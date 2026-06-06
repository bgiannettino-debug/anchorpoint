import Link from "next/link";
import { Stars } from "@/components/stars";
import { blendRating } from "@/lib/ratings";

// Mirrors the columns of public.climbs_index (what search_climbs returns).
export type ClimbResult = {
  uuid: string;
  name: string;
  yds?: string | null;
  vscale?: string | null;
  sport?: boolean | null;
  trad?: boolean | null;
  bouldering?: boolean | null;
  tr?: boolean | null;
  mixed?: boolean | null;
  ice?: boolean | null;
  aid?: boolean | null;
  alpine?: boolean | null;
  deepwatersolo?: boolean | null;
  area_uuid?: string | null;
  area_name?: string | null;
  path_tokens?: string[] | null;
  curated_stars?: number | null;
  curated_votes?: number | null;
  ugc_stars?: number | null;
  ugc_votes?: number | null;
};

type Group = {
  areaUuid: string | null;
  areaName: string;
  // Path above the crag (root → parent), shown as context under the
  // area heading.
  ancestors: string[];
  climbs: ClimbResult[];
};

function formatType(c: ClimbResult): string | null {
  const labels: string[] = [];
  if (c.sport) labels.push("Sport");
  if (c.trad) labels.push("Trad");
  if (c.bouldering) labels.push("Boulder");
  if (c.tr) labels.push("TR");
  if (c.mixed) labels.push("Mixed");
  if (c.ice) labels.push("Ice");
  if (c.aid) labels.push("Aid");
  if (c.alpine) labels.push("Alpine");
  if (c.deepwatersolo) labels.push("DWS");
  return labels.length ? labels.join("/") : null;
}

/**
 * Group flat search hits by their crag, preserving first-seen order.
 * Because the input arrives relevance-ranked from search_climbs, the
 * area holding the best match lands first, and routes stay ranked within
 * each area.
 */
export function groupByArea(climbs: ClimbResult[]): Group[] {
  const order: string[] = [];
  const map = new Map<string, Group>();
  for (const c of climbs) {
    const key = c.area_uuid ?? c.area_name ?? "—";
    let g = map.get(key);
    if (!g) {
      const path = (c.path_tokens ?? []).filter(Boolean);
      g = {
        areaUuid: c.area_uuid ?? null,
        areaName: c.area_name ?? path[path.length - 1] ?? "Unknown area",
        ancestors: path.slice(0, -1),
        climbs: [],
      };
      map.set(key, g);
      order.push(key);
    }
    g.climbs.push(c);
  }
  return order.map((k) => map.get(k)!);
}

/**
 * Route search results grouped under their crag. The area heading links
 * to the area page; each route links to its climb page. Used by the home
 * page "Routes" tab.
 */
export function ClimbResultsGrouped({ climbs }: { climbs: ClimbResult[] }) {
  const groups = groupByArea(climbs);
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.areaUuid ?? g.areaName}>
          <div className="mb-2">
            {g.areaUuid ? (
              <Link
                href={`/area/${g.areaUuid}`}
                className="text-lg font-semibold text-stone-900 dark:text-stone-100 hover:underline underline-offset-4"
              >
                {g.areaName}
              </Link>
            ) : (
              <span className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                {g.areaName}
              </span>
            )}
            {g.ancestors.length > 0 && (
              <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2">
                {g.ancestors.join(" › ")}
              </p>
            )}
          </div>
          <ul className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 divide-y divide-stone-200 dark:divide-stone-800">
            {g.climbs.map((c) => {
              const grade = c.yds ?? c.vscale ?? "—";
              const type = formatType(c);
              const rating = blendRating(c);
              return (
                <li key={c.uuid}>
                  <Link
                    href={`/climb/${c.uuid}`}
                    className="block px-5 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-stone-900 dark:text-stone-100">
                        {c.name}
                      </span>
                      <span className="text-sm text-stone-500 dark:text-stone-400 font-mono shrink-0">
                        {grade}
                      </span>
                    </div>
                    {(type || rating.votes > 0) && (
                      <div className="text-sm text-stone-500 dark:text-stone-400 mt-0.5 flex flex-wrap items-baseline gap-x-3">
                        {type && <span>{type}</span>}
                        <Stars {...rating} />
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
