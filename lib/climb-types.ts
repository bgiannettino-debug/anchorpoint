// Discipline filter options shared by the area page (filter the area's
// climbs) and the home page "Routes" search. Order matches
// formatClimbType's display order so chips read in the same sequence as
// the type labels on climb rows.
export const TYPE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "sport", label: "Sport" },
  { value: "trad", label: "Trad" },
  { value: "bouldering", label: "Boulder" },
  { value: "tr", label: "TR" },
  { value: "mixed", label: "Mixed" },
  { value: "ice", label: "Ice" },
  { value: "aid", label: "Aid" },
  { value: "alpine", label: "Alpine" },
  { value: "deepwatersolo", label: "DWS" },
];

export const KNOWN_TYPES = new Set(TYPE_FILTER_OPTIONS.map((o) => o.value));

// Parse a comma-separated `type` URL param into a set of known type keys,
// dropping anything unrecognized.
export function parseTypeFilter(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => KNOWN_TYPES.has(s));
  return new Set(parts);
}
