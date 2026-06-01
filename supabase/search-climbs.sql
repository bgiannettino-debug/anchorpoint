-- Ranked route-name search for the home page "Routes" tab.
-- =================================================================
-- Searching 230k climbs by name needs to be both relevant and fast.
-- We gate candidates with the pg_trgm `<%` (word-similarity) operator
-- using the GIN trigram index from climbs-index.sql, then re-rank the
-- filtered set: exact name → prefix → word-similarity → alphabetical,
-- so "monkey face" beats "King Louie Spire (Monkey Face)".
--
-- Optional filters layered on top:
--   - `types` restricts to selected disciplines (OR'd together).
--   - `yds_min` / `yds_max` restrict roped (non-bouldering) climbs to a
--     YDS range.
--   - `v_min`   / `v_max`   restrict boulders to a V-scale range.
--   - Both ranges may be set together; each climb is checked against
--     its own scale so "5.10–5.12 routes AND V3–V5 boulders" works.
--
-- Grade ranges read pre-parsed numeric columns (yds_num, v_num) that
-- scripts/sync-climbs.mjs populates from each climb's grade string.
--
-- Run once in the Supabase SQL editor after climbs-index.sql, then
-- re-run the sync workflow so the new columns get populated. Safe to
-- re-run — drops older signatures, adds columns idempotently, and
-- reloads the PostgREST schema cache at the end so the API picks up
-- the new function immediately.

create extension if not exists pg_trgm;

-- GiST trigram index was added in an earlier iteration for KNN ordering.
-- Unused by the current function but kept idempotently for future
-- tuning options.
create index if not exists climbs_index_name_gist
  on public.climbs_index using gist (name gist_trgm_ops);

-- Numeric grade columns used by the search_climbs grade-range params.
-- Populated by scripts/sync-climbs.mjs from each climb's YDS / V-scale
-- string. Null when the grade can't be parsed.
alter table public.climbs_index
  add column if not exists yds_num numeric(5, 3),
  add column if not exists v_num   numeric(5, 3);

-- Drop prior signatures so we never leave an ambiguous overload behind.
drop function if exists public.search_climbs(text, int);
drop function if exists public.search_climbs(text, text[], int);
drop function if exists public.search_climbs(
  text, text[], numeric, numeric, numeric, numeric, int
);

create or replace function public.search_climbs(
  q text,
  types text[] default null,
  yds_min numeric default null,
  yds_max numeric default null,
  v_min   numeric default null,
  v_max   numeric default null,
  max_results int default 50
)
returns setof public.climbs_index
language plpgsql
-- Volatile (explicit) rather than stable: stable functions can't run
-- `SET LOCAL`, which we use below to grant the statement-timeout
-- headroom this search occasionally needs. PostgREST doesn't care
-- about the volatility marker for this call, and the function is
-- semantically read-only either way.
volatile
as $$
begin
  -- Supabase's anon role has a 3s statement_timeout, which can fire on
  -- broad terms with selective filters. 8s is well under any
  -- pooler-level cap and is plenty of headroom — typical queries
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
    and (
      -- No grade range set: every climb passes.
      (yds_min is null and yds_max is null and v_min is null and v_max is null)
      -- V range set, climb is a boulder, climb's V is in range.
      or (
        (v_min is not null or v_max is not null)
        and c.bouldering is true
        and c.v_num is not null
        and (v_min is null or c.v_num >= v_min)
        and (v_max is null or c.v_num <= v_max)
      )
      -- YDS range set, climb is roped, climb's YDS is in range.
      or (
        (yds_min is not null or yds_max is not null)
        and coalesce(c.bouldering, false) is false
        and c.yds_num is not null
        and (yds_min is null or c.yds_num >= yds_min)
        and (yds_max is null or c.yds_num <= yds_max)
      )
    )
  order by
    (lower(c.name) = lower(q)) desc,   -- exact match
    (c.name ilike q || '%') desc,      -- prefix match
    word_similarity(q, c.name) desc,   -- fuzzy closeness
    c.name asc
  limit greatest(1, least(coalesce(max_results, 50), 100));
end;
$$;

grant execute on function public.search_climbs(
  text, text[], numeric, numeric, numeric, numeric, int
) to anon, authenticated;

notify pgrst, 'reload schema';
