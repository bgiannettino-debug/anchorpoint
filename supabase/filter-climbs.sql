-- Faceted climb search: filter the climbs_index by discipline + grade
-- range with NO name term required. This is the piece search_climbs
-- can't do — it gates every row on `q <% c.name` (word-similarity to the
-- name), so a nameless "show me all trad 5.10s" returns nothing there.
-- filter_climbs drops that gate and powers the Routes tab's filter-only
-- mode. Results lead with the best-rated climbs.
--
-- Apply: run this whole file in the Supabase SQL editor (same as
-- search-climbs.sql / curated-ratings.sql). Idempotent.
--
-- Depends on columns added by earlier migrations:
--   yds_num / v_num        (search-climbs.sql)
--   curated_stars          (curated-ratings.sql)
--   ugc_stars              (climb-ratings.sql)

-- Btree indexes so the grade-range predicate doesn't seq-scan ~230k rows.
create index if not exists climbs_index_yds_num_idx
  on public.climbs_index (yds_num);
create index if not exists climbs_index_v_num_idx
  on public.climbs_index (v_num);

drop function if exists public.filter_climbs(
  text[], numeric, numeric, numeric, numeric, int
);

create or replace function public.filter_climbs(
  types   text[] default null,
  yds_min numeric default null,
  yds_max numeric default null,
  v_min   numeric default null,
  v_max   numeric default null,
  max_results int default 50
)
returns setof public.climbs_index
language plpgsql
stable
as $$
begin
  return query
  select *
  from public.climbs_index c
  where (
      -- Discipline filter (same shape as search_climbs).
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
      -- Grade filter: no range → all pass; V range gates boulders;
      -- YDS range gates roped climbs (same shape as search_climbs).
      (yds_min is null and yds_max is null and v_min is null and v_max is null)
      or (
        (v_min is not null or v_max is not null)
        and c.bouldering is true
        and c.v_num is not null
        and (v_min is null or c.v_num >= v_min)
        and (v_max is null or c.v_num <= v_max)
      )
      or (
        (yds_min is not null or yds_max is not null)
        and coalesce(c.bouldering, false) is false
        and c.yds_num is not null
        and (yds_min is null or c.yds_num >= yds_min)
        and (yds_max is null or c.yds_num <= yds_max)
      )
    )
  order by
    -- Best-rated first; the blended display value is computed in the app,
    -- but ordering by the stronger of the two raw stars is close enough
    -- and keeps this index-friendly.
    greatest(coalesce(c.curated_stars, 0), coalesce(c.ugc_stars, 0)) desc,
    c.name asc
  limit greatest(1, least(coalesce(max_results, 50), 100));
end;
$$;

grant execute on function public.filter_climbs(
  text[], numeric, numeric, numeric, numeric, int
) to anon, authenticated;

-- Per-function timeout, mirroring search_climbs. A nameless facet scan
-- can touch more rows than a name search, so give it a little more room.
alter function public.filter_climbs(
  text[], numeric, numeric, numeric, numeric, int
) set statement_timeout = '12s';
