-- User-contributed climb photos
-- =================================================================
-- Signed-in users upload photos to a climb. The image bytes live in a
-- public Supabase Storage bucket (climb-photos); this table holds one
-- metadata row per photo (which climb, where in storage, dimensions for
-- next/image, optional caption, and the license the uploader consented
-- to). RLS mirrors climb_ratings: anyone can read, but you can only
-- write/delete your own rows. Storage policies tie each object's top
-- folder to the uploader's id so the bucket can't be written on behalf
-- of someone else.
--
-- Storage path convention (enforced by the policies below):
--   <auth.uid()>/<climb_uuid>/<random>.jpg
--
-- Run once in the Supabase SQL editor. Safe to re-run. The app degrades
-- gracefully until this is applied: photo reads return empty (the climb
-- page just shows no community photos) and uploads error in the UI.

create table if not exists public.climb_photos (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  climb_uuid   text        not null,
  storage_path text        not null unique,
  width        integer     not null check (width > 0),
  height       integer     not null check (height > 0),
  caption      text        check (caption is null or char_length(caption) <= 280),
  license      text        not null default 'CC BY-SA 4.0',
  created_at   timestamptz not null default now()
);

-- Newest-first lookups for a climb's gallery.
create index if not exists climb_photos_climb_idx
  on public.climb_photos (climb_uuid, created_at desc);

alter table public.climb_photos enable row level security;

drop policy if exists "Anyone can read climb_photos" on public.climb_photos;
create policy "Anyone can read climb_photos"
  on public.climb_photos for select using (true);

drop policy if exists "Users insert own photos" on public.climb_photos;
create policy "Users insert own photos"
  on public.climb_photos for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own photos" on public.climb_photos;
create policy "Users delete own photos"
  on public.climb_photos for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------
-- Storage bucket + policies for the image bytes.
-- ----------------------------------------------------------------------

-- Public bucket: objects are world-readable via the public URL (the
-- gallery uses plain <img>/next/image, no signed URLs). Writes are still
-- gated by the policies below.
insert into storage.buckets (id, name, public)
values ('climb-photos', 'climb-photos', true)
on conflict (id) do nothing;

drop policy if exists "Public read climb photos" on storage.objects;
create policy "Public read climb photos"
  on storage.objects for select
  using (bucket_id = 'climb-photos');

-- Authenticated users may upload only into their own top-level folder
-- (foldername[1] = their uid), so nobody can write as another user.
drop policy if exists "Users upload own climb photos" on storage.objects;
create policy "Users upload own climb photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'climb-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own climb photos" on storage.objects;
create policy "Users delete own climb photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'climb-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
