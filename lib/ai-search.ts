// Server-only. Turns a free-text climbing query ("slabby 5.10 trad near
// Boulder") into the exact discipline / grade / near params the Routes-tab
// faceted search (filter_climbs) already consumes — then the page redirects
// into that proven path. The model is a thin parser at the front door; it
// renders nothing itself.
//
// Uses Claude Haiku 4.5 with structured outputs so the response is always a
// validated object, never free text to parse. Haiku (not the Opus default)
// is a deliberate cost choice for a high-volume, low-complexity parse.
//
// Degrades gracefully: returns null when ANTHROPIC_API_KEY is unset (local
// dev / preview without the secret) or when the API call fails, so the Ask
// tab can show a friendly notice instead of erroring. Callers must handle
// null.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { KNOWN_TYPES, TYPE_FILTER_OPTIONS } from "./climb-types";
import { YDS_GRADES, V_GRADES } from "./grade-options";

export type AiSearchParams = {
  types: string[];
  ydsMin: string | null;
  ydsMax: string | null;
  vMin: string | null;
  vMax: string | null;
  near: string | null;
};

// Whether the AI search is wired up in this environment. The page checks
// this before calling parseAiQuery so the "not configured" message is shown
// without a wasted (and failing) API round-trip.
export function isAiSearchConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// The model picks grades/disciplines from the SAME vocab the UI filters use,
// so its output can't drift from what filter_climbs accepts. Casts to the
// tuple shape z.enum wants; the arrays are non-empty by construction.
const ydsEnum = z.enum(YDS_GRADES as [string, ...string[]]);
const vEnum = z.enum(V_GRADES as [string, ...string[]]);
const disciplineEnum = z.enum(
  TYPE_FILTER_OPTIONS.map((o) => o.value) as [string, ...string[]],
);

const QuerySchema = z.object({
  disciplines: z
    .array(disciplineEnum)
    .describe(
      "Climbing disciplines mentioned, e.g. sport, trad, bouldering. Empty if none specified.",
    ),
  ydsMin: ydsEnum
    .nullable()
    .describe("Lowest roped (YDS) grade, or null if no roped range is implied."),
  ydsMax: ydsEnum
    .nullable()
    .describe("Highest roped (YDS) grade, or null."),
  vMin: vEnum
    .nullable()
    .describe("Lowest boulder (V) grade, or null if no boulder range is implied."),
  vMax: vEnum.nullable().describe("Highest boulder (V) grade, or null."),
  near: z
    .string()
    .nullable()
    .describe(
      'A place to search near, as "City, ST" when possible (e.g. "Bend, OR"). Null if no location is mentioned.',
    ),
});

const SYSTEM = `You translate a climber's natural-language search into structured filters for a climbing-route database. Extract only what the query actually states; leave everything else null/empty. Do not invent disciplines, grades, or locations.

Grades:
- Roped climbs use the YDS scale (5.0–5.15d). Boulders use the V scale (V-easy–V17).
- A bare number like "5.10" means the whole letter band: set ydsMin to its "a" and ydsMax to its "d" (5.10 → 5.10a..5.10d). "5.11+" means the harder half (5.11c..5.11d); "5.11-" the easier half (5.11a..5.11b).
- "around 5.10", "5.10ish" → the full 5.10 band. "5.9 to 5.11" → ydsMin 5.9, ydsMax 5.11d. "easy" / "beginner" with no number → leave grades null.
- Only set V grades for bouldering queries; only set YDS grades for roped queries. If the discipline is bouldering, use V; otherwise use YDS.

Disciplines: map words to the allowed values — "sport", "trad" (traditional/gear), "bouldering" (boulder/boulders/highball), "tr" (toprope), "mixed", "ice", "aid" (aid/big wall), "alpine", "deepwatersolo" (DWS/psicobloc).

Location: if the query names a place ("near Boulder", "around Bishop", "in Yosemite"), put it in near as "City, ST" when you can infer the US state; otherwise the place as written. Crag/area names are fine if no city is given. Null if no place is mentioned.

Style words with no filter meaning (slabby, crimpy, classic, fun, steep) carry no grade/discipline/location — ignore them.`;

// Parse a natural-language query into faceted-search params. Returns null
// when AI search isn't configured or the call fails — callers fall back to a
// notice / the manual filters. Never throws.
export async function parseAiQuery(query: string): Promise<AiSearchParams | null> {
  const q = query.trim();
  if (!q || !isAiSearchConfigured()) return null;

  try {
    const client = new Anthropic();
    const message = await client.messages.parse({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      // Disabled: this is a fast extraction, not a reasoning task. (Haiku
      // doesn't accept the effort parameter, so there's nothing to tune.)
      thinking: { type: "disabled" },
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      output_config: { format: zodOutputFormat(QuerySchema) },
      messages: [{ role: "user", content: q }],
    });

    const parsed = message.parsed_output;
    if (!parsed) return null;

    // Defense in depth: the schema already constrains these, but drop
    // anything unexpected so a bad value can never reach the RPC.
    const types = parsed.disciplines.filter((t) => KNOWN_TYPES.has(t));
    return {
      types: Array.from(new Set(types)),
      ydsMin: pickGrade(parsed.ydsMin, YDS_GRADES),
      ydsMax: pickGrade(parsed.ydsMax, YDS_GRADES),
      vMin: pickGrade(parsed.vMin, V_GRADES),
      vMax: pickGrade(parsed.vMax, V_GRADES),
      near: parsed.near?.trim() || null,
    };
  } catch (err) {
    console.error("[ai-search] parse failed:", err);
    return null;
  }
}

function pickGrade(value: string | null, allowed: string[]): string | null {
  return value && allowed.includes(value) ? value : null;
}

// True when the parse yielded at least one filter worth running. An empty
// result (the model found nothing usable) should show "couldn't understand"
// rather than redirect to an unfiltered browse.
export function hasUsableFilters(p: AiSearchParams): boolean {
  return (
    p.types.length > 0 ||
    !!p.ydsMin ||
    !!p.ydsMax ||
    !!p.vMin ||
    !!p.vMax ||
    !!p.near
  );
}

// Build the Routes-tab URL for a parsed query, preserving the current
// location. The page redirects here; the existing Routes pipeline forward-
// geocodes `near` and runs filter_climbs. Pure — unit-testable without the
// API. Mirrors the param shape of the home page's routeTypeHref.
export function aiParamsToRouteHref(
  p: AiSearchParams,
  userLat: number | null,
  userLng: number | null,
): string {
  const sp = new URLSearchParams();
  sp.set("mode", "routes");
  if (p.types.length > 0) sp.set("type", p.types.join(","));
  if (p.ydsMin) sp.set("ydsMin", p.ydsMin);
  if (p.ydsMax) sp.set("ydsMax", p.ydsMax);
  if (p.vMin) sp.set("vMin", p.vMin);
  if (p.vMax) sp.set("vMax", p.vMax);
  if (p.near) sp.set("near", p.near);
  if (userLat !== null && userLng !== null) {
    sp.set("lat", String(userLat));
    sp.set("lng", String(userLng));
  }
  return `/?${sp.toString()}`;
}
