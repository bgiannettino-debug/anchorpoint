import { PageNav } from "@/components/page-nav";

export default function Loading() {
  return (
    <main className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
      <div className="max-w-4xl mx-auto">
        <PageNav />

        <div className="mt-6 animate-pulse" aria-label="Loading area">
          <div className="h-4 w-64 bg-stone-200 dark:bg-stone-800 rounded mb-4" />
          <div className="h-10 w-80 bg-stone-200 dark:bg-stone-800 rounded mb-3" />
          <div className="h-4 w-48 bg-stone-200 dark:bg-stone-800 rounded mb-10" />

          <div className="h-7 w-40 bg-stone-200 dark:bg-stone-800 rounded mb-4" />
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
