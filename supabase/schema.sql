-- Prépa AI — Supabase schema
-- Run this once in Supabase Dashboard → SQL Editor.

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  name text not null,
  subject text not null default 'Nouveau',
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid not null references public.decks(id) on delete cascade,
  question text not null,
  answer text not null,
  level text not null default 'À revoir' check (level in ('À revoir', 'Facile', 'Maîtrisé')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists courses_user_id_idx on public.courses(user_id);
create index if not exists decks_user_id_idx on public.decks(user_id);
create index if not exists cards_user_id_idx on public.cards(user_id);
create index if not exists cards_deck_id_idx on public.cards(deck_id);

alter table public.courses enable row level security;
alter table public.decks enable row level security;
alter table public.cards enable row level security;

-- Data API privileges for signed-in users. RLS below limits rows to the current user.
grant select, insert, update, delete on public.courses to authenticated;
grant select, insert, update, delete on public.decks to authenticated;
grant select, insert, update, delete on public.cards to authenticated;

drop policy if exists "courses_select_own" on public.courses;
drop policy if exists "courses_insert_own" on public.courses;
drop policy if exists "courses_update_own" on public.courses;
drop policy if exists "courses_delete_own" on public.courses;
drop policy if exists "decks_select_own" on public.decks;
drop policy if exists "decks_insert_own" on public.decks;
drop policy if exists "decks_update_own" on public.decks;
drop policy if exists "decks_delete_own" on public.decks;
drop policy if exists "cards_select_own" on public.cards;
drop policy if exists "cards_insert_own" on public.cards;
drop policy if exists "cards_update_own" on public.cards;
drop policy if exists "cards_delete_own" on public.cards;

create policy "courses_select_own" on public.courses for select using (auth.uid() = user_id);
create policy "courses_insert_own" on public.courses for insert with check (auth.uid() = user_id);
create policy "courses_update_own" on public.courses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "courses_delete_own" on public.courses for delete using (auth.uid() = user_id);

create policy "decks_select_own" on public.decks for select using (auth.uid() = user_id);
create policy "decks_insert_own" on public.decks for insert with check (auth.uid() = user_id);
create policy "decks_update_own" on public.decks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "decks_delete_own" on public.decks for delete using (auth.uid() = user_id);

create policy "cards_select_own" on public.cards for select using (auth.uid() = user_id);
create policy "cards_insert_own" on public.cards for insert with check (auth.uid() = user_id);
create policy "cards_update_own" on public.cards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cards_delete_own" on public.cards for delete using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at before update on public.courses for each row execute function public.set_updated_at();
drop trigger if exists cards_set_updated_at on public.cards;
create trigger cards_set_updated_at before update on public.cards for each row execute function public.set_updated_at();
