/**
 * Star-rating badge for a climb. Renders "★ 4.5 (38)" using the
 * curated rating average and vote count from climbs_index. Renders
 * nothing when no rating exists, so callers can drop it inline without
 * guards.
 *
 * The numeric value is shown directly (no filled/empty 5-star
 * rendering): the source data mixes a 0–4 scale (per-state vote files)
 * with a 0–5 scale (curated boulder CSV), so a literal number is more
 * honest than implying a fixed scale.
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
      title={`${stars.toFixed(2)} from ${votes} ${votes === 1 ? "vote" : "votes"} (MP, 2020)`}
    >
      <span aria-hidden>★</span>
      <span className="font-medium tabular-nums">{stars.toFixed(1)}</span>
      <span className="text-stone-500 dark:text-stone-400 font-normal">
        ({votes})
      </span>
    </span>
  );
}
