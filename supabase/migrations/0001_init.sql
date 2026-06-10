-- Bill Tracker schema
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('expense', 'income')),
  description text not null check (char_length(description) between 1 and 500),
  amount_cents integer not null check (amount_cents > 0),
  category text not null check (char_length(category) between 1 and 100),
  date date not null,
  inserted_at timestamptz not null default now()
);

-- Row Level Security: each signed-in user can only ever see and touch
-- their own rows. The public anon key is safe to ship because of this.
alter table public.transactions enable row level security;

create policy "Users can read own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transactions"
  on public.transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);

create index if not exists transactions_user_date
  on public.transactions (user_id, date desc);
