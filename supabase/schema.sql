-- =========================================================================
-- Personal Museum — Supabase schema
-- Run this in the Supabase SQL editor for the shared project.
-- =========================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.artworks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  image_path      text not null,
  status          text not null default 'pending',
  title           text,
  artist          text,
  period          text,
  date_text       text,
  medium          text,
  dimensions      text,
  location_guess  text,
  description     text,
  themes          text[] default '{}',
  caption         text,
  raw_ai          jsonb,
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists artworks_user_id_idx on public.artworks(user_id);
create index if not exists artworks_created_at_idx on public.artworks(created_at desc);

drop trigger if exists artworks_set_updated_at on public.artworks;
create trigger artworks_set_updated_at
before update on public.artworks
for each row execute function public.set_updated_at();

alter table public.artworks enable row level security;

drop policy if exists "users read own artworks"   on public.artworks;
drop policy if exists "users insert own artworks" on public.artworks;
drop policy if exists "users update own artworks" on public.artworks;
drop policy if exists "users delete own artworks" on public.artworks;

create policy "users read own artworks"
  on public.artworks for select
  using (auth.uid() = user_id);

create policy "users insert own artworks"
  on public.artworks for insert
  with check (auth.uid() = user_id);

create policy "users update own artworks"
  on public.artworks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own artworks"
  on public.artworks for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('artworks', 'artworks', false)
on conflict (id) do nothing;

drop policy if exists "users read own art images"   on storage.objects;
drop policy if exists "users upload own art images" on storage.objects;
drop policy if exists "users delete own art images" on storage.objects;

create policy "users read own art images"
  on storage.objects for select
  using (
    bucket_id = 'artworks'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users upload own art images"
  on storage.objects for insert
  with check (
    bucket_id = 'artworks'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users delete own art images"
  on storage.objects for delete
  using (
    bucket_id = 'artworks'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create table if not exists public.museum_sessions (
  session_code text primary key,
  seed_text text not null default 'museum-seed-alpha',
  grid_size integer not null default 800 check (grid_size between 500 and 2500),
  host_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.museum_sessions
  add column if not exists session_code text,
  add column if not exists seed_text text not null default 'museum-seed-alpha',
  add column if not exists grid_size integer not null default 800,
  add column if not exists host_user_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

delete from public.museum_sessions where session_code is null;
alter table public.museum_sessions alter column session_code set not null;
create unique index if not exists museum_sessions_session_code_key
  on public.museum_sessions(session_code);

create index if not exists museum_sessions_host_user_id_idx
  on public.museum_sessions(host_user_id);

drop trigger if exists museum_sessions_set_updated_at on public.museum_sessions;
create trigger museum_sessions_set_updated_at
before update on public.museum_sessions
for each row execute function public.set_updated_at();

alter table public.museum_sessions enable row level security;

drop policy if exists "authenticated users read museum sessions" on public.museum_sessions;
drop policy if exists "authenticated users create museum sessions" on public.museum_sessions;
drop policy if exists "authenticated users update museum sessions" on public.museum_sessions;

create policy "authenticated users read museum sessions"
  on public.museum_sessions for select
  to authenticated
  using (true);

create policy "authenticated users create museum sessions"
  on public.museum_sessions for insert
  to authenticated
  with check (auth.uid() = host_user_id);

create policy "authenticated users update museum sessions"
  on public.museum_sessions for update
  to authenticated
  using (true)
  with check (true);

create table if not exists public.user_museums (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot integer not null check (slot between 0 and 2),
  session_code text references public.museum_sessions(session_code) on delete set null,
  seed_text text not null,
  grid_size integer not null check (grid_size between 500 and 2500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);

alter table public.user_museums
  add column if not exists user_id uuid,
  add column if not exists slot integer,
  add column if not exists session_code text,
  add column if not exists seed_text text,
  add column if not exists grid_size integer,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.user_museums
set
  seed_text = coalesce(seed_text, 'museum-seed-alpha'),
  grid_size = coalesce(grid_size, 800);

delete from public.user_museums where user_id is null or slot is null;
alter table public.user_museums alter column user_id set not null;
alter table public.user_museums alter column slot set not null;
create unique index if not exists user_museums_user_id_slot_key
  on public.user_museums(user_id, slot);

create index if not exists user_museums_session_code_idx
  on public.user_museums(session_code);

drop trigger if exists user_museums_set_updated_at on public.user_museums;
create trigger user_museums_set_updated_at
before update on public.user_museums
for each row execute function public.set_updated_at();

alter table public.user_museums enable row level security;

drop policy if exists "users read own museums" on public.user_museums;
drop policy if exists "users insert own museums" on public.user_museums;
drop policy if exists "users update own museums" on public.user_museums;
drop policy if exists "users delete own museums" on public.user_museums;

create policy "users read own museums"
  on public.user_museums for select
  using (auth.uid() = user_id);

create policy "users insert own museums"
  on public.user_museums for insert
  with check (auth.uid() = user_id);

create policy "users update own museums"
  on public.user_museums for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own museums"
  on public.user_museums for delete
  using (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'museum_sessions'
  ) then
    alter publication supabase_realtime add table public.museum_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'artworks'
  ) then
    alter publication supabase_realtime add table public.artworks;
  end if;
end $$;
