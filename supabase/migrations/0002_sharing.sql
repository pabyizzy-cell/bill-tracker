-- Sharing: an owner grants other emails access to their data, with a role.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.shares (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  owner_email text not null,
  grantee_email text not null check (grantee_email = lower(grantee_email)),
  role text not null default 'viewer' check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  primary key (owner_id, grantee_email)
);

alter table public.shares enable row level security;

-- Owners have full control of their own share list.
create policy "Owners manage their share list"
  on public.shares for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- People can see (only) the grants addressed to their email, so the app
-- can show them whose data they may open.
create policy "Grantees can see shares addressed to them"
  on public.shares for select
  using (grantee_email = lower((select auth.jwt() ->> 'email')));

-- True when the signed-in user's email has been granted access to
-- data_owner's data at the required level ('viewer' is satisfied by
-- either role; 'editor' requires the editor role).
-- security definer: must read shares regardless of caller's row visibility.
create or replace function public.has_share_access(data_owner uuid, required_role text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.shares s
    where s.owner_id = data_owner
      and s.grantee_email = lower((select auth.jwt() ->> 'email'))
      and (required_role = 'viewer' or s.role = 'editor')
  );
$$;

-- Replace the owner-only transaction policies with shared-access versions.
drop policy if exists "Users can read own transactions" on public.transactions;
drop policy if exists "Users can insert own transactions" on public.transactions;
drop policy if exists "Users can update own transactions" on public.transactions;
drop policy if exists "Users can delete own transactions" on public.transactions;

create policy "Read own or shared transactions"
  on public.transactions for select
  using (auth.uid() = user_id or public.has_share_access(user_id, 'viewer'));

create policy "Insert own or editor-shared transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id or public.has_share_access(user_id, 'editor'));

create policy "Update own or editor-shared transactions"
  on public.transactions for update
  using (auth.uid() = user_id or public.has_share_access(user_id, 'editor'))
  with check (auth.uid() = user_id or public.has_share_access(user_id, 'editor'));

create policy "Delete own or editor-shared transactions"
  on public.transactions for delete
  using (auth.uid() = user_id or public.has_share_access(user_id, 'editor'));
