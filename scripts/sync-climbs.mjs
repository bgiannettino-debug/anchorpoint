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
//
// Talks to Supabase over its REST (PostgREST) endpoint with plain fetch
// rather than @supabase/supabase-js: the SDK instantiates a realtime
// WebSocket client on createClient(), which throws on Node < 22 ("no
// native WebSocket support"). This script only does batch upserts/deletes
// — no realtime — so REST keeps it dependency-free and Node-version-proof.
//
// Star ratings: each climb's OpenBeta `metadata.mp_id` is looked up in
// data/curated-ratings.json (built by scripts/extract-curated-ratings.mjs
// from OpenBeta's static 2020 community ratings) and written into the
// curated_stars / curated_votes columns. Climbs without an mp_id, or
// whose mp_id isn't in the snapshot, get null ratings — the UI hides
// the badge for those.

import { readFileSync, existsSync } from "node:fs";

const OPENBETA_API = process.env.OPENBETA_API ?? "https://api.openbeta.io";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
  process.exit(1);
}

const REST_URL = `${SUPABASE_URL}/rest/v1/climbs_index`;
const REST_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// OpenBeta caps `areas` at 500 results per page regardless of `limit`.
const PAGE_SIZE = 500;
// Rows per Supabase upsert call — keeps each request well under payload
// limits while minimizing round-trips.
const UPSERT_BATCH = 1000;
// Politeness pause between API pages so a full crawl doesn't hammer the
// public OpenBeta endpoint.
const PAGE_DELAY_MS = 200;
// Retry transient failures (5xx, 429, network blips) so one hiccup
// partway through an ~85-page crawl doesn't fail the whole run. OpenBeta
// returns the occasional 502; without this the run dies and re-runs from
// scratch.
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch + retry with exponential backoff. Retries on 5xx/429 and thrown
// network errors; returns the Response for any other status (incl. 4xx)
// so callers can surface a real error (e.g. a 401 bad key) without
// pointlessly retrying it.
async function fetchRetry(url, options, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status >= 500 || res.status === 429) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_RETRIES) break;
      const wait = Math.min(1000 * 2 ** (attempt - 1), 16000);
      console.warn(
        `  ${label} transient failure (attempt ${attempt}/${MAX_RETRIES}): ${err.message}; retrying in ${wait}ms`,
      );
      await sleep(wait);
    }
  }
  throw new Error(
    `${label} failed after ${MAX_RETRIES} attempts: ${lastErr?.message}`,
  );
}

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
        metadata { lat lng mp_id }
      }
    }
  }
`;

// Load the curated ratings snapshot (mp_id → [avgStars, voteCount]).
// Optional — if the file isn't present (e.g. very first sync before
// extract-curated-ratings.mjs has been committed), we skip rating
// joining and write nulls instead of failing the run.
const RATINGS_PATH = "data/curated-ratings.json";
const ratingsMap = existsSync(RATINGS_PATH)
  ? JSON.parse(readFileSync(RATINGS_PATH, "utf8"))
  : null;
if (ratingsMap) {
  console.log(
    `Loaded ${Object.keys(ratingsMap).length} curated ratings from ${RATINGS_PATH}`,
  );
} else {
  console.warn(`No ${RATINGS_PATH} found — climbs will sync without ratings.`);
}

function ratingFor(mpId) {
  if (!mpId || !ratingsMap) return { stars: null, votes: null };
  const r = ratingsMap[mpId];
  if (!r) return { stars: null, votes: null };
  return { stars: r[0], votes: r[1] };
}

async function gql(query, variables) {
  const res = await fetchRetry(
    OPENBETA_API,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
    "OpenBeta query",
  );
  if (!res.ok) throw new Error(`OpenBeta HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) {
    throw new Error(`OpenBeta GraphQL: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// Upsert a batch of rows by primary key (uuid). merge-duplicates maps to
// Postgres ON CONFLICT; return=minimal skips echoing the rows back.
async function upsert(rows) {
  const res = await fetchRetry(
    REST_URL,
    {
      method: "POST",
      headers: {
        ...REST_HEADERS,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    },
    "Supabase upsert",
  );
  if (!res.ok) {
    throw new Error(`Supabase upsert HTTP ${res.status}: ${await res.text()}`);
  }
}

// Drop OpenBeta's 0,0 "null island" sentinel and any non-numeric coord.
function coords(meta) {
  const lat = typeof meta?.lat === "number" ? meta.lat : null;
  const lng = typeof meta?.lng === "number" ? meta.lng : null;
  if (lat === null || lng === null) return { lat: null, lng: null };
  if (lat === 0 && lng === 0) return { lat: null, lng: null };
  return { lat, lng };
}

async function main() {
  // One timestamp for the whole run; every upserted row is stamped with
  // it so we can prune climbs that disappeared from OpenBeta afterward.
  const runAt = new Date().toISOString();
  let offset = 0;
  let total = 0;
  let buffer = [];

  async function flush() {
    if (buffer.length === 0) return;
    await upsert(buffer);
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
        const mpId = climb.metadata?.mp_id ?? null;
        const { stars, votes } = ratingFor(mpId);
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
          mp_id: mpId,
          curated_stars: stars,
          curated_votes: votes,
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
  // a partial failure can't wipe the index. count=exact returns the
  // number deleted in the Content-Range header (e.g. "*/12").
  const delRes = await fetch(
    `${REST_URL}?updated_at=lt.${encodeURIComponent(runAt)}`,
    {
      method: "DELETE",
      headers: { ...REST_HEADERS, Prefer: "count=exact,return=minimal" },
    },
  );
  if (!delRes.ok) {
    console.error(
      `Prune failed (non-fatal) HTTP ${delRes.status}: ${await delRes.text()}`,
    );
  } else {
    const pruned = delRes.headers.get("content-range")?.split("/")[1];
    if (pruned && pruned !== "0") console.log(`Pruned ${pruned} stale climbs`);
  }

  console.log(`Done. ${total} climbs indexed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
