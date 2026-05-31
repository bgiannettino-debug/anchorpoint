/**
 * Star-rating badge for a climb. Renders "★ 4.5 (38)" from a blended
 * value — caller computes the blend with lib/ratings.blendRating and
 * spreads the result, e.g.:
 *
 *     <Stars {...blendRating(climbRow)} />
 *
 * Renders nothing when there's no rating data, so callers can drop it
 * inline without guards. Numeric (not five-filled-or-empty stars)
 * because the curated source mixes a 0–4 and 0–5 scale; a literal
 * number doesn't imply either.
 */
export function Stars({
  stars,
  votes,
  size = "sm",
}: {
  stars: number | null | undefined;
  votes: number | null | undefined;
  size?: "sm" | "md";
}) {
  if (stars == null || votes == null || votes < 1) return null;
  const text = size === "md" ? "text-base" : "text-sm";
  return (
    <span
      className={`inline-flex items-baseline gap-1 ${text} text-amber-600 dark:text-amber-400`}
      title={`${stars.toFixed(2)} from ${votes} ${votes === 1 ? "vote" : "votes"}`}
    >
      <span aria-hidden>★</span>
      <span className="font-medium tabular-nums">{stars.toFixed(1)}</span>
      <span className="text-stone-500 dark:text-stone-400 font-normal">
        ({votes})
      </span>
    </span>
  );
}
