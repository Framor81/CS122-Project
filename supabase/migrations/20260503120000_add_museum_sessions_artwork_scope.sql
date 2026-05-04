-- Host-controlled museum collection scope + policies for cross-account reads.
-- Idempotent: safe to run more than once.

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

drop policy if exists "authenticated users read all artworks" on public.artworks;
create policy "authenticated users read all artworks"
  on public.artworks for select
  to authenticated
  using (true);

drop policy if exists "authenticated users read all art images" on storage.objects;
create policy "authenticated users read all art images"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'artworks');

notify pgrst, 'reload schema';
