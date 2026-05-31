/**
 * Blend a climb's curated (2020 MP) ratings with its UGC (Anchorpoint
 * user) ratings into a single displayed value. Vote-weighted average
 * so a climb with many curated votes isn't swung wildly by a single
 * new user vote.
 *
 * Returns { stars: null, votes: 0 } when there's nothing to show, so
 * callers can drop <Stars> in without guards.
 */
export type RatingSource = {
  curated_stars?: number | null;
  curated_votes?: number | null;
  ugc_stars?: number | null;
  ugc_votes?: number | null;
};

export function blendRating(s: RatingSource): {
  stars: number | null;
  votes: number;
} {
  const cv = s.curated_votes ?? 0;
  const uv = s.ugc_votes ?? 0;
  const total = cv + uv;
  if (total === 0) return { stars: null, votes: 0 };
  const cs = s.curated_stars ?? 0;
  const us = s.ugc_stars ?? 0;
  return {
    stars: (cs * cv + us * uv) / total,
    votes: total,
  };
}
