import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { suggestPlaces } from "@/lib/geocoding";

// Typeahead suggestions for the home search box. One endpoint, three
// sources keyed by `mode`: routes → Supabase search_climbs, areas →
// OpenBeta name match, location → Mapbox autocomplete. Kept server-side so
// tokens stay private and OpenBeta isn't hit cross-origin from the browser.

export type Suggestion = {
  id: string;
  label: string;
  sublabel?: string;
  href?: string; // routes/areas: navigate here
  lat?: number; // location: set near-me to these coords
  lng?: number;
};

const EMPTY = { suggestions: [] as Suggestion[] };
const LIMIT = 8;

type ClimbRow = {
  uuid: string;
  name: string;
  yds?: string | null;
  vscale?: string | null;
  area_name?: string | null;
  path_tokens?: string[] | null;
};

const AREA_QUERY = `
  query SuggestAreas($q: String!) {
    areas(filter: { area_name: { match: $q } }) {
      uuid
      area_name
      pathTokens
    }
  }
`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "";
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json(EMPTY);

  try {
    if (mode === "routes") {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("search_climbs", {
        q,
        max_results: LIMIT,
      });
      if (error) throw error;
      const suggestions: Suggestion[] = ((data ?? []) as ClimbRow[]).map((c) => ({
        id: c.uuid,
        label: c.name,
        sublabel: [
          c.yds ?? c.vscale ?? null,
          c.area_name ?? c.path_tokens?.[c.path_tokens.length - 1] ?? null,
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/climb/${c.uuid}`,
      }));
      return NextResponse.json({ suggestions });
    }

    if (mode === "areas") {
      const res = await fetch("https://api.openbeta.io", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: AREA_QUERY, variables: { q } }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`OpenBeta ${res.status}`);
      const json = (await res.json()) as {
        data?: {
          areas?: { uuid: string; area_name?: string; pathTokens?: string[] }[];
        };
      };
      const areas = json.data?.areas ?? [];
      const suggestions: Suggestion[] = areas.slice(0, LIMIT).map((a) => {
        const path = (a.pathTokens ?? []).filter(Boolean);
        return {
          id: a.uuid,
          label: a.area_name ?? path[path.length - 1] ?? "Area",
          sublabel: path.slice(0, -1).join(" › "),
          href: `/area/${a.uuid}`,
        };
      });
      return NextResponse.json({ suggestions });
    }

    if (mode === "location") {
      const places = await suggestPlaces(q);
      const suggestions: Suggestion[] = places.map((p, i) => ({
        id: `${p.lat},${p.lng},${i}`,
        label: p.label,
        lat: p.lat,
        lng: p.lng,
      }));
      return NextResponse.json({ suggestions });
    }

    return NextResponse.json(EMPTY);
  } catch (err) {
    console.error(`[suggest] ${mode} failed:`, err);
    // Non-fatal: the box still works as a plain search on submit.
    return NextResponse.json(EMPTY);
  }
}
