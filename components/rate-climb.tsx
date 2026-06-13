"use client";

import { useEffect, useState, useTransition, useSyncExternalStore } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  getAuthServerSnapshot,
  getAuthSnapshot,
  subscribeAuth,
} from "@/lib/auth";

type Props = {
  climbUuid: string;
};

/**
 * Five-star rating input for the climb page. Writes to the climb_ratings
 * table; a Postgres trigger recomputes the aggregate (ugc_stars, ugc_votes)
 * on climbs_index so the displayed badge updates on the next page rebuild.
 *
 * Reads auth + the user's existing rating CLIENT-side so the climb page can
 * be statically cached (ISR) — nothing per-user is fetched on the server.
 * Optimistic: the highlighted state flips immediately on click and reverts
 * if the upsert fails. The real auth gate is the RLS policy on the table.
 */
export function RateClimb({ climbUuid }: Props) {
  const auth = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthServerSnapshot,
  );
  const [stars, setStars] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const supabase = createClient();

  // Load this user's existing rating once signed in. (Stars aren't
  // rendered while signed-out/loading, so no synchronous reset is needed.)
  useEffect(() => {
    if (auth.status !== "signed-in") return;
    let active = true;
    void supabase
      .from("climb_ratings")
      .select("stars")
      .eq("climb_uuid", climbUuid)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setStars(data?.stars ?? null);
      });
    return () => {
      active = false;
    };
  }, [auth.status, climbUuid, supabase]);

  if (auth.status === "loading") {
    return <div className="h-7" aria-hidden="true" />;
  }

  if (auth.status === "signed-out") {
    return (
      <div className="text-sm text-stone-600 dark:text-stone-300">
        <Link
          href="/login"
          className="underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
        >
          Sign in
        </Link>{" "}
        to rate this climb.
      </div>
    );
  }

  function setRating(n: number) {
    const prev = stars;
    setStars(n);
    startTransition(async () => {
      const { error } = await supabase.from("climb_ratings").upsert(
        {
          climb_uuid: climbUuid,
          stars: n,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,climb_uuid" },
      );
      if (error) {
        console.error("Rating upsert failed:", error);
        setStars(prev);
      }
    });
  }

  function clearRating() {
    const prev = stars;
    setStars(null);
    startTransition(async () => {
      const { error } = await supabase
        .from("climb_ratings")
        .delete()
        .eq("climb_uuid", climbUuid);
      if (error) {
        console.error("Rating delete failed:", error);
        setStars(prev);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-stone-600 dark:text-stone-300">
        Your rating:
      </span>
      <div
        className="flex items-center"
        role="radiogroup"
        aria-label="Rate this climb"
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const active = stars != null && n <= stars;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={stars === n}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              onClick={() => setRating(n)}
              disabled={pending}
              className={`text-2xl leading-none px-0.5 transition-colors ${
                active
                  ? "text-amber-500"
                  : "text-stone-300 dark:text-stone-700 hover:text-amber-400"
              } ${pending ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
            >
              ★
            </button>
          );
        })}
      </div>
      {stars != null && (
        <button
          type="button"
          onClick={clearRating}
          disabled={pending}
          className="text-sm text-stone-500 dark:text-stone-400 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-60"
        >
          Clear
        </button>
      )}
    </div>
  );
}
