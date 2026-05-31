"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Props = {
  climbUuid: string;
  /** This user's existing rating (1–5), or null if unrated / not signed in. */
  initial: number | null;
  signedIn: boolean;
};

/**
 * Five-star rating input for the climb page. Writes to the
 * climb_ratings table; a Postgres trigger recomputes the aggregate
 * (ugc_stars, ugc_votes) on climbs_index so the displayed badge
 * everywhere else updates on the next page load.
 *
 * Optimistic: the highlighted state flips immediately on click, and
 * reverts if the upsert fails. Signed-out users see a "Sign in to
 * rate" link instead — the auth gate is the RLS policy on the table,
 * not this component, so a missed gate here can't cause a write.
 */
export function RateClimb({ climbUuid, initial, signedIn }: Props) {
  const [stars, setStars] = useState<number | null>(initial);
  const [pending, startTransition] = useTransition();
  const supabase = createClient();

  if (!signedIn) {
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
      // user_id defaults to auth.uid() in SQL; RLS enforces it. We send
      // only what we own so a stale client can't fake a different user.
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
      // RLS limits the delete to this user's own row, so the climb_uuid
      // filter is the only one we need to write.
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
      <div className="flex items-center" role="radiogroup" aria-label="Rate this climb">
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
