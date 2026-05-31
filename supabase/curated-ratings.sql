-- Curated star ratings for climbs_index.
-- =================================================================
-- Adds the columns the sync script populates from
-- data/curated-ratings.json (OpenBeta's static Aug-2020 community
-- ratings, ~124k climbs joined via mp_id). Display layer renders these
-- as "★ 4.5 (38)" on climb pages, area climb rows, and Routes search.
--
-- Run once in the Supabase SQL editor, then re-run the sync workflow.
-- Safe to re-run.

alter table public.climbs_index
  add column if not exists mp_id          text,
  add column if not exists curated_stars  numeric(3, 2),
  add column if not exists curated_votes  integer;

-- search_climbs returns `setof climbs_index`, so once the columns exist
-- the Routes search RPC automatically surfaces them — no function
-- change needed. Reload the API cache so PostgREST picks up the new
-- columns immediately.
notify pgrst, 'reload schema';
