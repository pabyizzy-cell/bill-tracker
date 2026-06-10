-- Projections: recurring bills/deposits and a per-user starting balance.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- (Requires 0002_sharing.sql, which created public.has_share_access.)

create table if not exists public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('expense', 'income')),
  description text not null check (char_length(description) between 1 and 500),
  amount_cents integer not null check (amount_cents > 0),
  category text not null check (char_length(category) between 1 and 100),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'yearly')),
  anchor_date date not null,
  inserted_at timestamptz not null default now()
);

alter table public.recurring_items enable row level security;

create policy "Read own or shared recurring items"
  on public.recurring_items for select
  using (auth.uid() = user_id or public.has_share_access(user_id, 'viewer'));

create policy "Insert own or editor-shared recurring items"
  on public.recurring_items for insert
  with check (auth.uid() = user_id or public.has_share_access(user_id, 'editor'));

create policy "Update own or editor-shared recurring items"
  on public.recurring_items for update
  using (auth.uid() = user_id or public.has_share_access(user_id, 'editor'))
  with check (auth.uid() = user_id or public.has_share_access(user_id, 'editor'));

create policy "Delete own or editor-shared recurring items"
  on public.recurring_items for delete
  using (auth.uid() = user_id or public.has_share_access(user_id, 'editor'));

create index if not exists recurring_items_user
  on public.recurring_items (user_id);

-- One row per user: their stated bank balance as of a date.
create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  starting_balance_cents bigint,
  starting_balance_date date,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "Read own or shared settings"
  on public.settings for select
  using (auth.uid() = user_id or public.has_share_access(user_id, 'viewer'));

create policy "Insert own or editor-shared settings"
  on public.settings for insert
  with check (auth.uid() = user_id or public.has_share_access(user_id, 'editor'));

create policy "Update own or editor-shared settings"
  on public.settings for update
  using (auth.uid() = user_id or public.has_share_access(user_id, 'editor'))
  with check (auth.uid() = user_id or public.has_share_access(user_id, 'editor'));

create policy "Delete own settings"
  on public.settings for delete
  using (auth.uid() = user_id);
