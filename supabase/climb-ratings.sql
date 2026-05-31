-- User-contributed star ratings — PR 2 of the ratings plan.
-- =================================================================
-- Complements the curated 2020 baseline (curated-ratings.sql). One row
-- per (user, climb); a trigger keeps an aggregate (ugc_stars,
-- ugc_votes) on climbs_index so the existing display path picks it up
-- automatically — search_climbs (returns `setof climbs_index`) and the
-- bulk Supabase queries on area / climb pages all flow through with no
-- code change. The UI blends curated and UGC with a vote-weighted
-- average.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.climb_ratings (
  user_id    uuid    not null default auth.uid() references auth.users(id) on delete cascade,
  climb_uuid text    not null,
  stars      integer not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, climb_uuid)
);

alter table public.climb_ratings enable row level security;

drop policy if exists "Anyone can read climb_ratings" on public.climb_ratings;
create policy "Anyone can read climb_ratings"
  on public.climb_ratings for select
  using (true);

drop policy if exists "Users insert own ratings" on public.climb_ratings;
create policy "Users insert own ratings"
  on public.climb_ratings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own ratings" on public.climb_ratings;
create policy "Users update own ratings"
  on public.climb_ratings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own ratings" on public.climb_ratings;
create policy "Users delete own ratings"
  on public.climb_ratings for delete
  using (auth.uid() = user_id);

-- Aggregate columns. The display layer blends these with
-- curated_stars / curated_votes via a vote-weighted average so climbs
-- without 2020 data still show stars once any UGC arrives.
alter table public.climbs_index
  add column if not exists ugc_stars numeric(3, 2),
  add column if not exists ugc_votes integer not null default 0;

-- Recompute the aggregate for one climb. Called from the trigger below
-- whenever a rating is added/changed/removed.
create or replace function public.refresh_climb_ugc(p_climb_uuid text)
returns void
language sql as $$
  update public.climbs_index ci
  set
    ugc_stars = sub.avg_stars,
    ugc_votes = sub.cnt
  from (
    select
      avg(stars)::numeric(3, 2) as avg_stars,
      count(*)::int as cnt
    from public.climb_ratings
    where climb_uuid = p_climb_uuid
  ) sub
  where ci.uuid = p_climb_uuid;
$$;

create or replace function public.climb_ratings_after_change()
returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_climb_ugc(old.climb_uuid);
    return old;
  end if;
  perform public.refresh_climb_ugc(new.climb_uuid);
  return new;
end;
$$;

drop trigger if exists climb_ratings_aiud on public.climb_ratings;
create trigger climb_ratings_aiud
after insert or update or delete on public.climb_ratings
for each row execute function public.climb_ratings_after_change();

notify pgrst, 'reload schema';
