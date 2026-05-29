import Link from "next/link";

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
 * A single route in the home page "Routes" search results. Links to the
 * climb page. Shows the full area path (path_tokens) as context, which
 * disambiguates the many same-named routes (e.g. the dozen "Monkey Face"s
 * across different states) without needing a Mapbox geocode lookup.
 */
export function ClimbResultCard({ climb }: { climb: ClimbResult }) {
  const grade = climb.yds ?? climb.vscale ?? "—";
  const type = formatType(climb);
  // path_tokens runs root→crag and ends with the climb's crag; show the
  // whole chain. Fall back to area_name if tokens are missing.
  const path = (climb.path_tokens ?? []).filter(Boolean);
  const location = path.length > 0 ? path.join(" › ") : (climb.area_name ?? null);

  return (
    <Link
      href={`/climb/${climb.uuid}`}
      className="block bg-white dark:bg-stone-900 rounded-lg shadow-sm p-6 border border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600 hover:shadow-md transition-all"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
          {climb.name}
        </h3>
        <span className="text-sm text-stone-600 dark:text-stone-300 font-mono shrink-0">
          {grade}
        </span>
      </div>
      {type && (
        <p className="text-sm text-stone-600 dark:text-stone-300 mt-2">{type}</p>
      )}
      {location && (
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1 truncate">
          {location}
        </p>
      )}
    </Link>
  );
}
