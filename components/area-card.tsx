import Link from "next/link";
import { formatGradeRange } from "@/lib/grades";
import { formatDistanceMiles } from "@/lib/geo";

type GradeCount = {
  label: string;
  count: number;
};

export type AreaCardData = {
  uuid: string;
  area_name: string;
  totalClimbs: number;
  metadata?: { lat?: number | null; lng?: number | null } | null;
  aggregate?: { byGrade?: GradeCount[] | null } | null;
};

export function AreaCard({
  area,
  distanceMiles,
  location,
}: {
  area: AreaCardData;
  distanceMiles?: number;
  /**
   * Pre-resolved "City, ST"-style label for the area's coordinates.
   * Passed in by server components that batch-resolve locations via
   * lib/geocoding. When absent, the card falls back to the raw lat/lng.
   */
  location?: string;
}) {
  const labels = area.aggregate?.byGrade?.map((g) => g.label) ?? [];
  const range = formatGradeRange(labels);
  const count =
    area.totalClimbs > 0
      ? `${area.totalClimbs} climb${area.totalClimbs === 1 ? "" : "s"}`
      : null;
  const subtitle = range && count ? `${range} · ${count}` : count;

  return (
    <Link
      href={`/area/${area.uuid}`}
      className="block bg-white dark:bg-stone-900 rounded-lg shadow-sm p-6 border border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600 hover:shadow-md transition-all"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
          {area.area_name}
        </h3>
        {distanceMiles != null && (
          <span className="text-sm text-stone-600 dark:text-stone-300 font-mono shrink-0">
            {formatDistanceMiles(distanceMiles)}
          </span>
        )}
      </div>
      {(location ||
        (area.metadata?.lat != null && area.metadata?.lng != null)) && (
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
          {location ??
            `${area.metadata!.lat!.toFixed(4)}, ${area.metadata!.lng!.toFixed(4)}`}
        </p>
      )}
      {subtitle && (
        <p className="text-sm text-stone-600 dark:text-stone-300 mt-2">
          {subtitle}
        </p>
      )}
    </Link>
  );
}
