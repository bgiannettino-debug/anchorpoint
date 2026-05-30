-- Ranked route-name search for the home page "Routes" tab.
-- =================================================================
-- Searching 230k climbs by name needs to be both relevant and fast. The
-- pg_trgm `<%` (word-similarity) operator + the GIN trigram index from
-- climbs-index.sql gives us cheap, index-backed candidate filtering. We
-- then re-rank the filtered set: exact name → prefix → word-similarity →
-- alphabetical, so "monkey face" beats "King Louie Spire (Monkey Face)".
--
-- `types` optionally restricts to selected disciplines (OR'd together).
-- Pass null/empty for no type restriction.
--
-- Run once in the Supabase SQL editor, after climbs-index.sql. Safe to
-- re-run — drops older signatures and reloads the PostgREST schema cache
-- at the end so the API immediately picks up the new function.

create extension if not exists pg_trgm;

-- GiST trigram index was added in an earlier iteration for KNN ordering.
-- The current function uses the GIN index (from climbs-index.sql) via the
-- `<%` filter instead, so this one is unused — kept idempotently so the
-- file stays safe to re-run and the option is there for future tuning.
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
language plpgsql
stable
as $$
begin
  -- Supabase's anon role has a 3s statement_timeout, which can fire on
  -- broad terms with selective type filters (e.g. "crack" + Sport only),
  -- where the sort runs over thousands of candidates. 8s is well under
  -- any pooler-level cap and is plenty of headroom — typical queries
  -- still return in well under a second.
  set local statement_timeout = '8s';

  return query
  select *
  from public.climbs_index c
  where q <% c.name           -- GIN-indexed word-similarity gate
    and (
      types is null
      or cardinality(types) = 0
      or (c.sport and 'sport' = any(types))
      or (c.trad and 'trad' = any(types))
      or (c.bouldering and 'bouldering' = any(types))
      or (c.tr and 'tr' = any(types))
      or (c.mixed and 'mixed' = any(types))
      or (c.ice and 'ice' = any(types))
      or (c.aid and 'aid' = any(types))
      or (c.alpine and 'alpine' = any(types))
      or (c.deepwatersolo and 'deepwatersolo' = any(types))
    )
  order by
    (lower(c.name) = lower(q)) desc,   -- exact match
    (c.name ilike q || '%') desc,      -- prefix match
    word_similarity(q, c.name) desc,   -- fuzzy closeness
    c.name asc
  limit greatest(1, least(coalesce(max_results, 50), 100));
end;
$$;

-- Callable by the public (anon) and signed-in (authenticated) roles. The
-- function runs as the caller (SECURITY INVOKER, the default), so the
-- table's public-read RLS policy still applies.
grant execute on function public.search_climbs(text, text[], int) to anon, authenticated;

-- Tell PostgREST to refresh its schema cache so the new function is
-- callable immediately (otherwise the API may 404 until the next reload).
notify pgrst, 'reload schema';
