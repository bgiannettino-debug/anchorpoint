-- User profiles (public display name)
-- =================================================================
-- One row per user holding a chosen display name. It's shown publicly —
-- as the credit on uploaded photos (replacing the generic "Community"),
-- and, later, as the attributed author on contributions pushed upstream
-- to OpenBeta. RLS mirrors climb_ratings: anyone can read (names are
-- public), you can only write your own row.
--
-- Run once in the Supabase SQL editor. Safe to re-run. The app degrades
-- gracefully until applied: photo credits fall back to "Community".

create table if not exists public.profiles (
  user_id      uuid        primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text        check (display_name is null or char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Anyone can read profiles" on public.profiles;
create policy "Anyone can read profiles"
  on public.profiles for select using (true);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
