"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  getTicksServerSnapshot,
  getTicksSnapshot,
  subscribeTicks,
  TICK_STYLES,
  type TickStyle,
} from "@/lib/ticks";
import {
  getAuthServerSnapshot,
  getAuthSnapshot,
  subscribeAuth,
} from "@/lib/auth";

const PREVIEW_LIMIT = 5;

const STYLE_LABEL: Record<TickStyle, string> = Object.fromEntries(
  TICK_STYLES.map((s) => [s.value, s.label]),
) as Record<TickStyle, string>;

export function TicksPreview() {
  const auth = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthServerSnapshot,
  );
  const items = useSyncExternalStore(
    subscribeTicks,
    getTicksSnapshot,
    getTicksServerSnapshot,
  );

  if (auth.status !== "signed-in" || items.length === 0) return null;

  const recent = items.slice(0, PREVIEW_LIMIT);

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200">
          Latest {recent.length} tick{recent.length === 1 ? "" : "s"}
        </h2>
        <Link
          href="/ticks"
          className="text-sm text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
        >
          View all ({items.length})
        </Link>
      </div>
      <ul className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 divide-y divide-stone-200 dark:divide-stone-800">
        {recent.map((t) => (
          <li key={t.id}>
            <Link
              href={`/climb/${t.climbUuid}`}
              className="block px-6 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-stone-900 dark:text-stone-100">
                  {t.climbName}
                </span>
                <span className="text-xs text-stone-500 dark:text-stone-400 font-mono shrink-0">
                  {t.climbGrade ?? ""}
                </span>
              </div>
              <div className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
                {STYLE_LABEL[t.style]} · {t.dateClimbed}
                {t.laps > 1 && ` · ${t.laps} laps`}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
