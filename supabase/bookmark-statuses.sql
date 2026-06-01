-- Status, notes, and last-attempt for bookmarks.
-- =================================================================
-- Lets the existing saved-routes infrastructure double as a projects /
-- wishlist list. A bookmark can carry a status (the default "bookmark",
-- or "project" / "wishlist"), an optional notes field, and an optional
-- last-attempt timestamp that the climb page can bump when the user
-- taps "Mark attempt".
--
-- "Sent" isn't a status — that's already implied by having a tick.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.bookmarks
  add column if not exists status text not null default 'bookmark',
  add column if not exists notes text,
  add column if not exists last_attempt_at timestamptz;

-- Drop the constraint if a prior run left an older shape, then add the
-- current one. add constraint isn't IF NOT EXISTS-friendly directly,
-- so we wrap it in a do-block.
alter table public.bookmarks
  drop constraint if exists bookmarks_status_check;
alter table public.bookmarks
  add constraint bookmarks_status_check
  check (status in ('bookmark', 'project', 'wishlist'));

notify pgrst, 'reload schema';
