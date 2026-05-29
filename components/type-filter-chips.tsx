import Link from "next/link";
import { TYPE_FILTER_OPTIONS } from "@/lib/climb-types";

/**
 * Toggle chips for filtering climbs by discipline. Presentational only —
 * the caller supplies `hrefFor`, which returns the URL for toggling a
 * given type value (so the area page can point at /area/<uuid> and the
 * home page at /?mode=routes, each preserving their own params).
 */
export function TypeFilterChips({
  active,
  hrefFor,
  ariaLabel = "Filter by type",
}: {
  active: Set<string>;
  hrefFor: (value: string) => string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-2 mb-3"
    >
      {TYPE_FILTER_OPTIONS.map((opt) => {
        const isActive = active.has(opt.value);
        return (
          <Link
            key={opt.value}
            href={hrefFor(opt.value)}
            aria-pressed={isActive}
            className={
              isActive
                ? "px-3 py-1 rounded-full text-sm bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium"
                : "px-3 py-1 rounded-full text-sm border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
            }
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
