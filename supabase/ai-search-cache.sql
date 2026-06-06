-- AI "Ask" search: server-side memoization + per-IP rate limiting for the
-- natural-language query parser (lib/ai-search.ts). The Ask box is
-- unauthenticated, so this caps Haiku cost/abuse and skips repeat calls.
--
-- Both objects are reached only via the service-role admin client (RLS
-- bypassed), mirroring the geocoded_locations cache in lib/geocoding.ts.
-- The app degrades gracefully if this migration hasn't run yet: a cache
-- read/write error falls through to a live Haiku call, and a missing
-- rate-limit function fails open (allows the call). So deploy order
-- between the code and this file doesn't matter.
--
-- Apply: run this whole file in the Supabase SQL editor. Idempotent.

-- Parsed-query cache. Key is the normalized query text ("slabby 5.10 trad"
-- → "slabby 5.10 trad"); value is the AiSearchParams JSON the parser
-- produced. Empty parses are cached too, so junk queries can't be replayed
-- to run up Haiku cost.
create table if not exists public.ai_query_cache (
  query_norm text primary key,
  params     jsonb not null,
  created_at timestamptz not null default now()
);

-- Per-IP fixed-window counter. One row per (ip, window) bucket — bounded in
-- size and cheap to increment. Old buckets are pruned opportunistically by
-- ai_rate_check.
create table if not exists public.ai_rate_limit (
  ip           text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (ip, window_start)
);

-- Atomically record one call for `client_ip` and report whether it's within
-- the limit for the current fixed window. Returns true when allowed (the
-- call still counts), false once the limit is exceeded. SECURITY DEFINER so
-- it runs with the owner's rights regardless of the calling role.
create or replace function public.ai_rate_check(
  client_ip      text,
  max_calls      int default 30,
  window_seconds int default 3600
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket timestamptz;
  tally  int;
begin
  -- Floor now() to the window size so each window is a fixed bucket.
  bucket := to_timestamp(
    floor(extract(epoch from now()) / window_seconds) * window_seconds
  );

  insert into public.ai_rate_limit (ip, window_start, count)
  values (client_ip, bucket, 1)
  on conflict (ip, window_start)
    do update set count = public.ai_rate_limit.count + 1
  returning count into tally;

  -- Opportunistic cleanup of stale buckets — keeps the table tiny without a
  -- separate cron. Cheap at this volume.
  delete from public.ai_rate_limit
  where window_start < bucket - make_interval(secs => window_seconds);

  return tally <= max_calls;
end;
$$;

grant execute on function public.ai_rate_check(text, int, int)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
