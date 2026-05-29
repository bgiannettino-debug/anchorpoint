-- Ranked route-name search for the home page "Routes" tab.
-- =================================================================
-- A plain ILIKE '%term%' returns matches in arbitrary order, so a broad
-- term (capped at N rows) can miss the obvious answer. This function
-- ranks: exact name first, then prefix matches, then trigram similarity,
-- then alphabetical — so "monkey face" surfaces the route named exactly
-- that ahead of "King Louie Spire (Monkey Face)".
--
-- `types` optionally restricts results to selected disciplines (OR'd
-- together), applied BEFORE the limit so the discipline filter and the
-- ranking compose correctly. Pass null/empty for no type restriction.
--
-- Run once in the Supabase SQL editor, after climbs-index.sql (which
-- creates the table + the pg_trgm extension this relies on). Safe to
-- re-run — it drops older signatures first.

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
  from public.climbs_index
  where name ilike '%' || q || '%'
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
  order by
    (lower(name) = lower(q)) desc,   -- exact match
    (name ilike q || '%') desc,      -- prefix match
    similarity(name, q) desc,        -- fuzzy closeness
    name asc
  limit greatest(1, least(coalesce(max_results, 50), 100));
$$;

-- Callable by the public (anon) and signed-in (authenticated) roles. The
-- function runs as the caller (SECURITY INVOKER, the default), so the
-- table's public-read RLS policy still applies.
grant execute on function public.search_climbs(text, text[], int) to anon, authenticated;
