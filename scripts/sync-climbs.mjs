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
// partway through an ~85-page crawl doesn't fail the whole run. Keep
// per-page retries modest so hopeless pages bail to "skipped" quickly
// (1+2+4+8 = 15s budget per page) instead of eating the whole job
// timeout on persistently 504-ing pages.
const MAX_RETRIES = 5;
const MAX_BACKOFF_MS = 16_000;
// If a single page still fails after all retries, skip it and keep
// crawling — losing 500 climbs from one page is far better than throwing
// away 100k+ of upserted progress. Generous cap so a sustained-but-
// recoverable flaky period (lots of intermittent 504s) doesn't bail the
// whole run; a clean re-run later fills in any skips.
const MAX_SKIPPED_PAGES = 10;

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
      const wait = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
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

// Phase 1: just list the leaf area uuids. We can't use the nested
// `climbs { metadata { mp_id } }` form here — OpenBeta's resolver for
// climbs inside the bulk `areas` query always returns mp_id as null
// (verified end-to-end). So this query intentionally fetches only
// uuids; the actual climb data comes from Phase 2.
const LIST_QUERY = `
  query List($limit: Int!, $offset: Int!) {
    areas(filter: { leaf_status: { isLeaf: true } }, limit: $limit, offset: $offset) {
      uuid
    }
  }
`;

// Phase 2 sends batched aliased `area(uuid)` queries (the single-area
// form DOES populate mp_id). Constants tuned to keep request size
// modest and ride OpenBeta's flakiness — concurrency 5 hits ~150 areas
// in flight at once across batches.
const AREA_BATCH_SIZE = 30;
const AREA_CONCURRENCY = 5;

// Build a single GraphQL request that fetches up to AREA_BATCH_SIZE
// areas in one round-trip via aliases (a0, a1, ...).
function buildAreaBatchQuery(uuids) {
  const fields =
    `area_name pathTokens climbs { uuid name grades { yds vscale } ` +
    `type { sport trad bouldering tr mixed ice aid alpine deepwatersolo } ` +
    `metadata { lat lng mp_id } }`;
  const aliases = uuids
    .map((u, i) => `a${i}: area(uuid: "${u}") { uuid ${fields} }`)
    .join(" ");
  return `{ ${aliases} }`;
}

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
  let total = 0;
  let buffer = [];
  let skippedPages = 0;
  let skippedBatches = 0;

  async function flush() {
    if (buffer.length === 0) return;
    // Atomically swap so multiple workers can call flush concurrently
    // without losing rows between check and upsert.
    const batch = buffer;
    buffer = [];
    await upsert(batch);
    total += batch.length;
    console.log(`  upserted ${total} climbs so far`);
  }

  // Phase 1: list every leaf area's uuid. The bulk `areas` query is
  // fast (500 uuids per request, ~86 requests for the whole catalog),
  // but doesn't fill mp_id — see LIST_QUERY for why.
  console.log(`Listing leaf areas from ${OPENBETA_API} ...`);
  const areaUuids = [];
  let offset = 0;
  for (;;) {
    let data;
    try {
      data = await gql(LIST_QUERY, { limit: PAGE_SIZE, offset });
    } catch (err) {
      console.error(
        `list offset=${offset} failed after retries: ${err.message}; skipping`,
      );
      skippedPages++;
      if (skippedPages >= MAX_SKIPPED_PAGES) {
        throw new Error(
          `Aborting: ${skippedPages} list pages failed — OpenBeta appears to be down.`,
        );
      }
      offset += PAGE_SIZE;
      await sleep(PAGE_DELAY_MS);
      continue;
    }
    const got = data?.areas ?? [];
    if (got.length === 0) break;
    for (const a of got) if (a?.uuid) areaUuids.push(a.uuid);
    offset += PAGE_SIZE;
    if (got.length < PAGE_SIZE) break;
    await sleep(PAGE_DELAY_MS);
  }
  console.log(`Discovered ${areaUuids.length} leaf areas.`);

  // Phase 2: fetch the climbs of each area via aliased `area(uuid)`
  // queries (this resolver DOES populate mp_id, unlike `areas`). N
  // concurrent workers pull batches off a shared cursor.
  const batches = [];
  for (let i = 0; i < areaUuids.length; i += AREA_BATCH_SIZE) {
    batches.push(areaUuids.slice(i, i + AREA_BATCH_SIZE));
  }
  console.log(
    `Fetching climbs in ${batches.length} batches of up to ${AREA_BATCH_SIZE} (concurrency ${AREA_CONCURRENCY}) ...`,
  );

  let nextBatch = 0;
  async function worker() {
    for (;;) {
      const idx = nextBatch++;
      if (idx >= batches.length) return;
      const uuids = batches[idx];
      let data;
      try {
        data = await gql(buildAreaBatchQuery(uuids), {});
      } catch (err) {
        console.error(
          `batch ${idx} (${uuids.length} areas) failed after retries: ${err.message}; skipping`,
        );
        skippedBatches++;
        continue;
      }
      // Aliased response: { a0: {...}, a1: {...} ... } — iterate.
      for (const key of Object.keys(data ?? {})) {
        const area = data[key];
        if (!area?.uuid) continue;
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
      if ((idx + 1) % 25 === 0) {
        console.log(`  batches ${idx + 1}/${batches.length} done`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: AREA_CONCURRENCY }, () => worker()),
  );
  await flush();

  // Prune climbs removed from OpenBeta since this run began. Skip when
  // ANY list page or fetch batch was skipped — those climbs still have
  // their old updated_at and would be wrongly pruned. count=exact
  // returns the number deleted in the Content-Range header.
  if (skippedPages > 0 || skippedBatches > 0) {
    console.warn(
      `Skipping prune: ${skippedPages} list page(s) + ${skippedBatches} fetch batch(es) failed this run; their climbs would be wrongly deleted.`,
    );
  } else {
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
  }

  const skipNote =
    skippedPages || skippedBatches
      ? ` (${skippedPages} list page(s) + ${skippedBatches} fetch batch(es) skipped — re-run to fill)`
      : "";
  console.log(`Done. ${total} climbs indexed${skipNote}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
