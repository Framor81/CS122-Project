-- Minimal patch for shared session artwork mode.
-- Run this in Supabase SQL editor, then you can delete this file.

-- 1) Add host-controlled artwork scope to session metadata.
alter table public.museum_sessions
  add column if not exists artwork_scope text not null default 'host';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'museum_sessions_artwork_scope_check'
  ) then
    alter table public.museum_sessions
      add constraint museum_sessions_artwork_scope_check
      check (artwork_scope in ('host', 'all'));
  end if;
end $$;

update public.museum_sessions
set artwork_scope = 'host'
where artwork_scope is null;

-- 2) Allow authenticated users to read artworks across accounts
--    (required when host selects "all accounts").
drop policy if exists "authenticated users read all artworks" on public.artworks;
create policy "authenticated users read all artworks"
  on public.artworks for select
  to authenticated
  using (true);

-- 3) Allow authenticated users to read images in the artworks bucket
--    so signed URLs can be created for cross-account artwork rows.
drop policy if exists "authenticated users read all art images" on storage.objects;
create policy "authenticated users read all art images"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'artworks');
