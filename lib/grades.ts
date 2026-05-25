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
