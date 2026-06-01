import { gradeToNumber, vScaleToNumber } from "./grades";

// "Tick" grades for the min/max dropdowns. Spans the realistic range
// for OpenBeta data — finer than a slider, coarser than every variant
// OpenBeta might store (we still match those at filter time via the
// numeric comparison).

// YDS: 5.0 – 5.9 single-tick, 5.10+ split into a/b/c/d.
export const YDS_GRADES: string[] = [
  "5.0",
  "5.1",
  "5.2",
  "5.3",
  "5.4",
  "5.5",
  "5.6",
  "5.7",
  "5.8",
  "5.9",
  ...["5.10", "5.11", "5.12", "5.13", "5.14", "5.15"].flatMap((g) =>
    ["a", "b", "c", "d"].map((suf) => g + suf),
  ),
];

// V-scale: V-easy through V17. OpenBeta does see V12+ on a few problems
// but most usage tops out around V14.
export const V_GRADES: string[] = [
  "V-easy",
  ...Array.from({ length: 18 }, (_, i) => `V${i}`),
];

const YDS_NUMS = YDS_GRADES.map((g) => gradeToNumber(g) ?? Number.NaN);
const V_NUMS = V_GRADES.map((g) => vScaleToNumber(g) ?? Number.NaN);

export type GradeRange = {
  ydsMin: string;
  ydsMax: string;
  vMin: string;
  vMax: string;
};

export const EMPTY_GRADE_RANGE: GradeRange = {
  ydsMin: "",
  ydsMax: "",
  vMin: "",
  vMax: "",
};

/**
 * Read the four grade-range params from a searchParams object. Values
 * are validated against the known grade lists; anything else falls
 * back to "" (no constraint).
 */
export function parseGradeRange(p: {
  ydsMin?: string;
  ydsMax?: string;
  vMin?: string;
  vMax?: string;
}): GradeRange {
  const pickYds = (s: string | undefined) =>
    s && YDS_GRADES.includes(s) ? s : "";
  const pickV = (s: string | undefined) =>
    s && V_GRADES.includes(s) ? s : "";
  return {
    ydsMin: pickYds(p.ydsMin),
    ydsMax: pickYds(p.ydsMax),
    vMin: pickV(p.vMin),
    vMax: pickV(p.vMax),
  };
}

export function isGradeRangeActive(r: GradeRange): boolean {
  return !!(r.ydsMin || r.ydsMax || r.vMin || r.vMax);
}

function ydsBound(label: string): number | null {
  const i = YDS_GRADES.indexOf(label);
  if (i < 0) return null;
  return YDS_NUMS[i];
}

function vBound(label: string): number | null {
  const i = V_GRADES.indexOf(label);
  if (i < 0) return null;
  return V_NUMS[i];
}

/**
 * Decide whether a climb falls within the active range.
 *
 * Behaviour:
 *   - With no range set, every climb passes.
 *   - With only a YDS range set, only roped climbs in that YDS range
 *     pass; boulders are excluded (different scale entirely).
 *   - With only a V range set, only boulders in that V range pass.
 *   - With both ranges set, each climb is checked against its own
 *     scale (so you can filter "5.10–5.12 OR V3–V5" by setting both).
 */
export function climbInGradeRange(
  climb: {
    yds?: string | null;
    vscale?: string | null;
    bouldering?: boolean | null;
  },
  range: GradeRange,
): boolean {
  if (!isGradeRangeActive(range)) return true;

  const isBoulder = !!climb.bouldering;
  const ydsSet = !!(range.ydsMin || range.ydsMax);
  const vSet = !!(range.vMin || range.vMax);

  if (isBoulder) {
    if (!vSet) return false;
    const v = climb.vscale ? vScaleToNumber(climb.vscale) : null;
    if (v == null) return false;
    const lo = range.vMin ? vBound(range.vMin) : null;
    const hi = range.vMax ? vBound(range.vMax) : null;
    if (lo != null && v < lo) return false;
    if (hi != null && v > hi) return false;
    return true;
  }

  if (!ydsSet) return false;
  const y = climb.yds ? gradeToNumber(climb.yds) : null;
  if (y == null) return false;
  const lo = range.ydsMin ? ydsBound(range.ydsMin) : null;
  const hi = range.ydsMax ? ydsBound(range.ydsMax) : null;
  if (lo != null && y < lo) return false;
  if (hi != null && y > hi) return false;
  return true;
}
