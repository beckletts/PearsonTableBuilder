-- Pearson Table Builder — Migration v2
-- Run in Supabase SQL editor AFTER the initial schema.sql

-- ── Tabs: extend the tables table ────────────────────────────────────────────
alter table public.tables
  add column if not exists tab_group_id  uuid    references public.tables(id) on delete set null,
  add column if not exists tab_order     integer not null default 0;

create index if not exists tables_tab_group_idx on public.tables (tab_group_id);

-- Helper: checks whether a parent table is published without triggering RLS
-- (SECURITY DEFINER breaks the self-referential policy recursion)
create or replace function public.is_parent_table_published(parent_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.tables
    where id = parent_id and is_published = true
  );
$$;

-- Secondary tabs in a published group are publicly readable
create policy "tables_tab_public_select" on public.tables
  for select using (
    tab_group_id is not null
    and public.is_parent_table_published(tab_group_id)
  );

create policy "table_rows_tab_public_select" on public.table_rows
  for select using (
    exists (
      select 1 from public.tables t
      where t.id = table_rows.table_id
        and t.tab_group_id is not null
        and public.is_parent_table_published(t.tab_group_id)
    )
  );


-- ── Sharing ───────────────────────────────────────────────────────────────────
create table if not exists public.table_shares (
  id                  uuid        default gen_random_uuid() primary key,
  table_id            uuid        references public.tables on delete cascade not null,
  owner_id            uuid        references auth.users not null,
  collaborator_email  text        not null,
  created_at          timestamptz default now(),
  unique (table_id, collaborator_email)
);

alter table public.table_shares enable row level security;

create policy "shares_owner_all" on public.table_shares
  for all using (auth.uid() = owner_id);

-- Collaborator can see shares addressed to their email
create policy "shares_collaborator_select" on public.table_shares
  for select using (collaborator_email = (auth.jwt() ->> 'email'));

-- Collaborators can read tables shared with them
create policy "tables_collaborator_select" on public.tables
  for select using (
    exists (
      select 1 from public.table_shares
      where table_id = tables.id
        and collaborator_email = (auth.jwt() ->> 'email')
    )
  );

-- Collaborators can update (but not delete) shared tables
create policy "tables_collaborator_update" on public.tables
  for update using (
    exists (
      select 1 from public.table_shares
      where table_id = tables.id
        and collaborator_email = (auth.jwt() ->> 'email')
    )
  );

-- Collaborators can manage rows of shared tables
create policy "table_rows_collaborator_all" on public.table_rows
  for all using (
    exists (
      select 1 from public.table_shares
      where table_id = table_rows.table_id
        and collaborator_email = (auth.jwt() ->> 'email')
    )
  );

-- Collaborators can also read/manage secondary tabs of shared primary tables
create policy "tables_shared_tab_all" on public.tables
  for all using (
    tab_group_id is not null and exists (
      select 1 from public.table_shares
      where table_id = tables.tab_group_id
        and collaborator_email = (auth.jwt() ->> 'email')
    )
  );
