/**
 * Helpers for working with YDS (Yosemite Decimal System) climbing grades.
 *
 * YDS grades look like "5.7", "5.10a", "5.11+", "5.12c/d", etc.
 * Sorting them lexicographically is wrong — "5.9" would come AFTER "5.10"
 * because "9" > "1". We need to parse them into a numeric sort key.
 */

/**
 * Convert a YDS grade string to a sortable number.
 * Returns null if the grade can't be parsed.
 *
 * Examples:
 *   "5.7"     → 7
 *   "5.9"     → 9
 *   "5.10a"   → 10
 *   "5.10b"   → 10.25
 *   "5.10c"   → 10.5
 *   "5.10d"   → 10.75
 *   "5.11+"   → 11.125  (slightly harder than 5.11)
 *   "5.11-"   → 10.875  (slightly easier than 5.11)
 */
export function gradeToNumber(grade: string): number | null {
  const match = grade.match(/^5\.(\d+)([a-d])?([+\-])?/i);
  if (!match) return null;

  const num = parseInt(match[1], 10);
  const letter = match[2]?.toLowerCase();
  const modifier = match[3];

  let sub = 0;
  if (letter === "a") sub = 0;
  else if (letter === "b") sub = 0.25;
  else if (letter === "c") sub = 0.5;
  else if (letter === "d") sub = 0.75;

  if (modifier === "+") sub += 0.125;
  else if (modifier === "-") sub -= 0.125;

  return num + sub;
}

/**
 * Convert a V-scale (Vermin / bouldering) grade string to a sortable
 * number. Returns null if it can't be parsed.
 *
 * Handles the common shapes OpenBeta returns:
 *   "V-easy" → -1     ("easier than V0")
 *   "V0-"    → -0.25
 *   "V0"     → 0
 *   "V0+"    → 0.5
 *   "V0-1"   → 0.5    (midpoint of a soft-grade range)
 *   "V5"     → 5
 *   "V12+"   → 12.5
 */
export function vScaleToNumber(grade: string): number | null {
  const g = grade.trim().toLowerCase();
  if (g === "v-easy" || g === "veasy") return -1;
  // "v3-5" / "v3-4" — midpoint of the stated range.
  const range = g.match(/^v(\d+)-(\d+)$/);
  if (range) {
    const lo = parseInt(range[1], 10);
    const hi = parseInt(range[2], 10);
    return (lo + hi) / 2;
  }
  const m = g.match(/^v(\d+)([+\-])?$/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  if (m[2] === "+") return num + 0.5;
  if (m[2] === "-") return num - 0.25;
  return num;
}

/**
 * Given a list of YDS grade strings, return a human-readable range
 * like "5.7 – 5.13a" or "5.10b" (when all share a grade).
 * Returns null if none are parseable YDS grades (e.g. all V-grades).
 */
export function formatGradeRange(grades: string[]): string | null {
  // Collect (grade string, sort key) pairs, dropping anything unparseable.
  const graded = grades
    .filter((g): g is string => typeof g === "string" && g.length > 0)
    .map((g) => ({ grade: g, sort: gradeToNumber(g) }))
    .filter((g): g is { grade: string; sort: number } => g.sort !== null);

  if (graded.length === 0) return null;

  graded.sort((a, b) => a.sort - b.sort);
  const min = graded[0].grade;
  const max = graded[graded.length - 1].grade;

  return min === max ? min : `${min} – ${max}`;
}
