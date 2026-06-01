/**
 * Home-route loading skeleton. Without this, a slow OpenBeta or
 * Mapbox response left the browser showing the previous page until
 * the server-render resolved — the "hangs until I refresh" symptom.
 * The Next App Router renders this instantly on navigation while the
 * page's server component finishes its IO.
 */
export default function Loading() {
  return (
    <main className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse" aria-label="Loading">
          <div className="h-10 w-48 bg-stone-200 dark:bg-stone-800 rounded mb-3" />
          <div className="h-4 w-72 bg-stone-200 dark:bg-stone-800 rounded mb-8" />

          {/* Tabs */}
          <div className="flex gap-2 mb-3">
            <div className="h-7 w-20 bg-stone-200 dark:bg-stone-800 rounded-full" />
            <div className="h-7 w-20 bg-stone-200 dark:bg-stone-800 rounded-full" />
          </div>

          {/* Search row */}
          <div className="flex flex-col sm:flex-row gap-2 mb-8">
            <div className="h-12 flex-1 bg-stone-200 dark:bg-stone-800 rounded-lg" />
            <div className="h-12 w-full sm:w-24 bg-stone-200 dark:bg-stone-800 rounded-lg" />
          </div>

          <div className="h-9 w-44 bg-stone-200 dark:bg-stone-800 rounded mb-8" />
          <div className="h-60 w-full bg-stone-200 dark:bg-stone-800 rounded-lg mb-8" />

          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-stone-900 rounded-lg p-6 border border-stone-200 dark:border-stone-800"
              >
                <div className="h-6 w-56 bg-stone-200 dark:bg-stone-800 rounded mb-3" />
                <div className="h-4 w-40 bg-stone-200 dark:bg-stone-800 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
