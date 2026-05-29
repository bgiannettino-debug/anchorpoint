-- Ranked route-name search for the home page "Routes" tab.
-- =================================================================
-- Searching 230k climbs by name needs to be both relevant and fast. A
-- plain ILIKE '%term%' ordered by similarity() scans/sorts every match,
-- which times out on common words ("crack" matches 6k+ rows, "the" tens
-- of thousands). Instead we:
--   1. Filter with the trigram word-similarity operator `q <% name`
--      (index-backed) so only genuinely-similar names are considered.
--   2. Take the top 300 by KNN word-distance (`name <->> q`) using a
--      GiST trigram index — this returns the closest matches WITHOUT
--      sorting the whole match set, so even broad terms stay fast.
--   3. Re-rank that small set: exact name → prefix → word-similarity →
--      alphabetical, so "monkey face" beats "King Louie Spire (Monkey
--      Face)".
--
-- `types` optionally restricts to selected disciplines (OR'd together),
-- applied inside the candidate filter so type + ranking compose. Pass
-- null/empty for no type restriction.
--
-- Run once in the Supabase SQL editor, after climbs-index.sql. Safe to
-- re-run — it drops older signatures and reloads the PostgREST schema
-- cache at the end (so the API immediately sees the new function).

create extension if not exists pg_trgm;

-- KNN-capable trigram index for fast top-K fuzzy ordering (the GIN index
-- from climbs-index.sql can't drive `ORDER BY ... <->> ...`).
create index if not exists climbs_index_name_gist
  on public.climbs_index using gist (name gist_trgm_ops);

-- Drop prior versions so we never leave an ambiguous overload behind.
drop function if exists public.search_climbs(text, int);
drop function if exists public.search_climbs(text, text[], int);

create or replace function public.search_climbs(
  q text,
  types text[] default null,
  max_results int default 50
)
returns setof public.climbs_index
language sql
stable
as $$
  select *
  from (
    select *
    from public.climbs_index
    where q <% name
      and (
        types is null
        or cardinality(types) = 0
        or (sport and 'sport' = any(types))
        or (trad and 'trad' = any(types))
        or (bouldering and 'bouldering' = any(types))
        or (tr and 'tr' = any(types))
        or (mixed and 'mixed' = any(types))
        or (ice and 'ice' = any(types))
        or (aid and 'aid' = any(types))
        or (alpine and 'alpine' = any(types))
        or (deepwatersolo and 'deepwatersolo' = any(types))
      )
    order by name <->> q   -- KNN word-distance via the GiST index
    limit 300
  ) c
  order by
    (lower(c.name) = lower(q)) desc,   -- exact match
    (c.name ilike q || '%') desc,      -- prefix match
    word_similarity(q, c.name) desc,   -- fuzzy closeness
    c.name asc
  limit greatest(1, least(coalesce(max_results, 50), 100));
$$;

-- Callable by the public (anon) and signed-in (authenticated) roles. The
-- function runs as the caller (SECURITY INVOKER, the default), so the
-- table's public-read RLS policy still applies.
grant execute on function public.search_climbs(text, text[], int) to anon, authenticated;

-- Tell PostgREST to refresh its schema cache so the new function is
-- callable immediately (otherwise the API may 404 until the next reload).
notify pgrst, 'reload schema';
