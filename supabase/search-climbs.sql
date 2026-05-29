-- Ranked route-name search for the home page "Routes" tab.
-- =================================================================
-- A plain ILIKE '%term%' returns matches in arbitrary order, so a broad
-- term (capped at N rows) can miss the obvious answer. This function
-- ranks: exact name first, then prefix matches, then trigram similarity,
-- then alphabetical — so "monkey face" surfaces the route named exactly
-- that ahead of "King Louie Spire (Monkey Face)".
--
-- Run once in the Supabase SQL editor, after climbs-index.sql (which
-- creates the table + the pg_trgm extension this relies on).

create or replace function public.search_climbs(q text, max_results int default 50)
returns setof public.climbs_index
language sql
stable
as $$
  select *
  from public.climbs_index
  where name ilike '%' || q || '%'
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
grant execute on function public.search_climbs(text, int) to anon, authenticated;
