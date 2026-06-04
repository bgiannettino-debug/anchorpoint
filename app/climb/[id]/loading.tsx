import { PageNav } from "@/components/page-nav";

export default function Loading() {
  return (
    <main className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
      <div className="max-w-3xl mx-auto">
        <PageNav />
        <div className="mt-6 animate-pulse" aria-label="Loading climb">
          <div className="h-4 w-64 bg-stone-200 dark:bg-stone-800 rounded mb-4" />
          <div className="flex items-baseline justify-between gap-4">
            <div className="h-10 w-72 bg-stone-200 dark:bg-stone-800 rounded" />
            <div className="h-7 w-20 bg-stone-200 dark:bg-stone-800 rounded shrink-0" />
          </div>
          <div className="h-4 w-56 bg-stone-200 dark:bg-stone-800 rounded mt-3" />
          <div className="h-4 w-80 bg-stone-200 dark:bg-stone-800 rounded mt-2" />
        </div>
      </div>
    </main>
  );
}
