// Crawls OpenBeta for every climb and upserts a lean search index into
// Supabase (public.climbs_index), which backs the home page "Routes"
// search. OpenBeta exposes no climb-name search query, so we page
// through every leaf crag (which returns its climbs nested) and store
// just enough to render a result + link to /climb/<uuid>.
//
// Run weekly by .github/workflows/sync-climbs.yml, or by hand with
// `npm run sync`. Requires:
//   NEXT_PUBLIC_SUPABASE_URL   - Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  - service-role key (bypasses RLS; never
//                                expose client-side)
//   OPENBETA_API (optional)    - defaults to https://api.openbeta.io
//
// Create the table first with supabase/climbs-index.sql.

import { createClient } from "@supabase/supabase-js";

const OPENBETA_API = process.env.OPENBETA_API ?? "https://api.openbeta.io";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
  process.exit(1);
}

// OpenBeta caps `areas` at 500 results per page regardless of `limit`.
const PAGE_SIZE = 500;
// Rows per Supabase upsert call — keeps each request well under payload
// limits while minimizing round-trips.
const UPSERT_BATCH = 1000;
// Politeness pause between API pages so a full crawl doesn't hammer the
// public OpenBeta endpoint.
const PAGE_DELAY_MS = 200;

const CRAWL_QUERY = `
  query Crawl($limit: Int!, $offset: Int!) {
    areas(filter: { leaf_status: { isLeaf: true } }, limit: $limit, offset: $offset) {
      uuid
      area_name
      pathTokens
      climbs {
        uuid
        name
        grades { yds vscale }
        type { sport trad bouldering tr mixed ice aid alpine deepwatersolo }
        metadata { lat lng }
      }
    }
  }
`;

async function gql(query, variables) {
  const res = await fetch(OPENBETA_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`OpenBeta HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) {
    throw new Error(`OpenBeta GraphQL: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// Drop OpenBeta's 0,0 "null island" sentinel and any non-numeric coord.
function coords(meta) {
  const lat = typeof meta?.lat === "number" ? meta.lat : null;
  const lng = typeof meta?.lng === "number" ? meta.lng : null;
  if (lat === null || lng === null) return { lat: null, lng: null };
  if (lat === 0 && lng === 0) return { lat: null, lng: null };
  return { lat, lng };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // One timestamp for the whole run; every upserted row is stamped with
  // it so we can prune climbs that disappeared from OpenBeta afterward.
  const runAt = new Date().toISOString();
  let offset = 0;
  let total = 0;
  let buffer = [];

  async function flush() {
    if (buffer.length === 0) return;
    const { error } = await supabase
      .from("climbs_index")
      .upsert(buffer, { onConflict: "uuid" });
    if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
    total += buffer.length;
    buffer = [];
    console.log(`  upserted ${total} climbs so far`);
  }

  console.log(`Crawling ${OPENBETA_API} ...`);
  for (;;) {
    const data = await gql(CRAWL_QUERY, { limit: PAGE_SIZE, offset });
    const areas = data?.areas ?? [];
    if (areas.length === 0) break;

    for (const area of areas) {
      for (const climb of area.climbs ?? []) {
        if (!climb?.uuid || !climb?.name) continue;
        const c = coords(climb.metadata);
        const t = climb.type ?? {};
        buffer.push({
          uuid: climb.uuid,
          name: climb.name,
          yds: climb.grades?.yds ?? null,
          vscale: climb.grades?.vscale ?? null,
          sport: t.sport ?? null,
          trad: t.trad ?? null,
          bouldering: t.bouldering ?? null,
          tr: t.tr ?? null,
          mixed: t.mixed ?? null,
          ice: t.ice ?? null,
          aid: t.aid ?? null,
          alpine: t.alpine ?? null,
          deepwatersolo: t.deepwatersolo ?? null,
          area_uuid: area.uuid,
          area_name: area.area_name,
          path_tokens: area.pathTokens ?? null,
          lat: c.lat,
          lng: c.lng,
          updated_at: runAt,
        });
        if (buffer.length >= UPSERT_BATCH) await flush();
      }
    }

    console.log(`page offset=${offset}: ${areas.length} crags`);
    offset += PAGE_SIZE;
    if (areas.length < PAGE_SIZE) break; // short page → last page
    await sleep(PAGE_DELAY_MS);
  }
  await flush();

  // Prune climbs removed from OpenBeta since this run began. Only reached
  // after a full crawl succeeded (any page/upsert error throws above), so
  // a partial failure can't wipe the index.
  const { error: delError, count } = await supabase
    .from("climbs_index")
    .delete({ count: "exact" })
    .lt("updated_at", runAt);
  if (delError) {
    console.error(`Prune failed (non-fatal): ${delError.message}`);
  } else if (count) {
    console.log(`Pruned ${count} stale climbs`);
  }

  console.log(`Done. ${total} climbs indexed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
