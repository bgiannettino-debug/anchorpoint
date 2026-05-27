"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  type Tick,
  getTicksServerSnapshot,
  getTicksSnapshot,
  removeTick,
  subscribeTicks,
  TICK_STYLES,
  type TickStyle,
} from "@/lib/ticks";
import {
  getAuthServerSnapshot,
  getAuthSnapshot,
  subscribeAuth,
} from "@/lib/auth";

const STYLE_LABEL: Record<TickStyle, string> = Object.fromEntries(
  TICK_STYLES.map((s) => [s.value, s.label]),
) as Record<TickStyle, string>;

// How many ticks to show on first render, and how many more to reveal
// per "Show more" click. Keep them equal so the user can predict.
const TICKS_INITIAL_SHOWN = 10;
const TICKS_PAGE_SIZE = 10;

export default function TicksPage() {
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
  const [shown, setShown] = useState(TICKS_INITIAL_SHOWN);
  const visible = items.slice(0, shown);

  return (
    <main className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/"
          className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
        >
          ← Home
        </Link>

        <h1 className="text-4xl font-bold text-stone-900 dark:text-stone-100 mt-6 mb-8">
          Latest ticks
        </h1>

        {auth.status === "loading" ? null : auth.status === "signed-out" ? (
          <p className="text-stone-500 dark:text-stone-400">
            <Link
              href="/login"
              className="underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
            >
              Sign in
            </Link>{" "}
            to view and log your ticks.
          </p>
        ) : items.length === 0 ? (
          <p className="text-stone-500 dark:text-stone-400">
            You haven&apos;t logged any ticks yet. Open a climb and use the
            &ldquo;Log a tick&rdquo; form.
          </p>
        ) : (
          <>
            <ul className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 divide-y divide-stone-200 dark:divide-stone-800">
              {visible.map((t) => (
                <TickRow key={t.id} tick={t} />
              ))}
            </ul>
            {items.length > shown && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() =>
                    setShown((s) =>
                      Math.min(s + TICKS_PAGE_SIZE, items.length),
                    )
                  }
                  className="inline-block px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                >
                  Show more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function TickRow({ tick: t }: { tick: Tick }) {
  return (
    <li className="flex items-start">
      <Link
        href={`/climb/${t.climbUuid}`}
        className="flex-1 block px-6 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-stone-900 dark:text-stone-100">
            {t.climbName}
          </span>
          {t.climbGrade && (
            <span className="text-sm text-stone-500 dark:text-stone-400 font-mono shrink-0">
              {t.climbGrade}
            </span>
          )}
        </div>
        <div className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
          {STYLE_LABEL[t.style]} · {t.dateClimbed}
          {t.laps > 1 && ` · ${t.laps} laps`}
          {t.suggestedGrade && t.suggestedGrade !== t.climbGrade && (
            <>
              {" · "}
              <span>
                felt {t.suggestedGrade}
              </span>
            </>
          )}
          {t.parentName && (
            <>
              {" · "}
              <span>{t.parentName}</span>
            </>
          )}
        </div>
        {t.notes && (
          <p className="text-sm text-stone-600 dark:text-stone-300 mt-1 whitespace-pre-line">
            {t.notes}
          </p>
        )}
      </Link>
      <button
        type="button"
        onClick={() => void removeTick(t.id)}
        aria-label={`Remove tick on ${t.climbName}`}
        className="px-4 py-3 text-sm text-stone-500 dark:text-stone-400 hover:text-red-700 dark:hover:text-red-400 transition-colors"
      >
        Remove
      </button>
    </li>
  );
}
