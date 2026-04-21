-- =========================================================================
-- Personal Museum — Supabase schema
-- Run this in the Supabase SQL editor after creating your project.
-- =========================================================================

-- 1) Artworks table ---------------------------------------------------------
create table if not exists public.artworks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  image_path      text not null,            -- path inside the 'artworks' storage bucket
  status          text not null default 'pending', -- 'pending' | 'ready' | 'error'
  title           text,
  artist          text,
  period          text,
  date_text       text,                     -- e.g. "1889" or "c. 1665"
  medium          text,
  dimensions      text,
  location_guess  text,                     -- where the artwork lives (if the AI can guess)
  description     text,
  themes          text[] default '{}',
  caption         text,                     -- user's own caption
  raw_ai          jsonb,                    -- full AI payload for debugging
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists artworks_user_id_idx on public.artworks(user_id);
create index if not exists artworks_created_at_idx on public.artworks(created_at desc);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists artworks_set_updated_at on public.artworks;
create trigger artworks_set_updated_at
before update on public.artworks
for each row execute function public.set_updated_at();

-- 2) Row-level security -----------------------------------------------------
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
  using (auth.uid() = user_id);

create policy "users delete own artworks"
  on public.artworks for delete
  using (auth.uid() = user_id);

-- 3) Storage bucket ---------------------------------------------------------
-- Create a PRIVATE bucket called 'artworks'. Objects live at: {user_id}/{uuid}.jpg
insert into storage.buckets (id, name, public)
values ('artworks', 'artworks', false)
on conflict (id) do nothing;

-- Storage policies: each user can only touch files inside their own folder
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
