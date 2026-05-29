-- Route search index
-- =================================================================
-- Backs the home page "Routes" search. OpenBeta's GraphQL API has no
-- "search climbs by name" query (only `climb(uuid)` and area filters),
-- so we crawl every leaf crag's climbs into this lean table and search
-- it directly. Populated by scripts/sync-climbs.mjs (run weekly by the
-- sync-climbs GitHub Action). Only the fields needed to render a search
-- result + link to /climb/<uuid> are stored — full detail still loads
-- live from OpenBeta when the user opens a climb.
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor).

create extension if not exists pg_trgm;

create table if not exists public.climbs_index (
  uuid          text primary key,
  name          text not null,
  yds           text,
  vscale        text,
  -- Discipline flags, mirroring OpenBeta's ClimbType.
  sport         boolean,
  trad          boolean,
  bouldering    boolean,
  tr            boolean,
  mixed         boolean,
  ice           boolean,
  aid           boolean,
  alpine        boolean,
  deepwatersolo boolean,
  -- Parent crag, for context in results + a back-link target.
  area_uuid     text,
  area_name     text,
  -- Root→crag path (e.g. {USA, Oregon, Smith Rock}) to disambiguate
  -- routes that share a name.
  path_tokens   text[],
  lat           double precision,
  lng           double precision,
  -- Set to the sync run's timestamp on every upsert. Rows whose
  -- updated_at predates the latest run are climbs that vanished from
  -- OpenBeta and get pruned at the end of a full crawl.
  updated_at    timestamptz not null default now()
);

-- Trigram GIN index → fast fuzzy ILIKE '%term%' / similarity() search
-- over ~230k route names (sub-100ms).
create index if not exists climbs_index_name_trgm
  on public.climbs_index using gin (name gin_trgm_ops);

-- Public read-only. Writes happen only via the service-role key (used by
-- the sync script), which bypasses RLS — so no insert/update policy is
-- needed and anon clients can never modify the index.
alter table public.climbs_index enable row level security;

drop policy if exists "Public can read climbs_index" on public.climbs_index;
create policy "Public can read climbs_index"
  on public.climbs_index for select
  using (true);
