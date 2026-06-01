/**
 * Suspense fallback for <WeatherForecast>. Same outer shape so the
 * page doesn't visibly reflow once Open-Meteo resolves.
 */
export function WeatherSkeleton() {
  return (
    <section
      aria-label="Loading weather"
      className="mb-4 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 animate-pulse"
    >
      <div className="flex items-baseline gap-3 flex-wrap">
        <div className="h-7 w-7 bg-stone-200 dark:bg-stone-800 rounded" />
        <div className="h-7 w-20 bg-stone-200 dark:bg-stone-800 rounded" />
        <div className="h-5 w-24 bg-stone-200 dark:bg-stone-800 rounded" />
      </div>
      <div className="h-4 w-72 bg-stone-200 dark:bg-stone-800 rounded mt-2" />
      <div className="grid grid-cols-3 gap-2 mt-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-20 rounded-md border border-stone-200 dark:border-stone-800"
          />
        ))}
      </div>
    </section>
  );
}
