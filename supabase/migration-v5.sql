-- migration-v5: Sharing for linked dashboards
-- Run this in the Supabase SQL editor AFTER migration-v4.sql

-- ── Linked dashboard shares ───────────────────────────────────────────────────
create table if not exists public.linked_dashboard_shares (
  id                  uuid        default gen_random_uuid() primary key,
  dashboard_id        uuid        references public.linked_dashboards on delete cascade not null,
  owner_id            uuid        references auth.users not null,
  collaborator_email  text        not null,
  access_level        text        not null default 'view' check (access_level in ('view', 'edit')),
  created_at          timestamptz default now(),
  unique (dashboard_id, collaborator_email)
);

alter table public.linked_dashboard_shares enable row level security;

-- Owner can manage all their shares
create policy "ld_shares_owner_all" on public.linked_dashboard_shares
  for all using (auth.uid() = owner_id);

-- Collaborator can see shares addressed to their email
create policy "ld_shares_collaborator_select" on public.linked_dashboard_shares
  for select using (collaborator_email = (auth.jwt() ->> 'email'));

-- Collaborators can read dashboards shared with them
create policy "ld_collaborator_select" on public.linked_dashboards
  for select using (
    exists (
      select 1 from public.linked_dashboard_shares
      where dashboard_id = linked_dashboards.id
        and collaborator_email = (auth.jwt() ->> 'email')
    )
  );

-- Edit collaborators can update (but not delete) shared dashboards
create policy "ld_collaborator_update" on public.linked_dashboards
  for update using (
    exists (
      select 1 from public.linked_dashboard_shares
      where dashboard_id = linked_dashboards.id
        and collaborator_email = (auth.jwt() ->> 'email')
        and access_level = 'edit'
    )
  );

-- Edit collaborators can read/manage sources in shared dashboards
create policy "ls_collaborator_all" on public.linked_sources
  for all using (
    exists (
      select 1 from public.linked_dashboard_shares
      where dashboard_id = linked_sources.dashboard_id
        and collaborator_email = (auth.jwt() ->> 'email')
        and access_level = 'edit'
    )
  );

-- Edit collaborators can read/manage rows in shared dashboards
create policy "lr_collaborator_all" on public.linked_rows
  for all using (
    exists (
      select 1 from public.linked_dashboard_shares
      where dashboard_id = linked_rows.dashboard_id
        and collaborator_email = (auth.jwt() ->> 'email')
        and access_level = 'edit'
    )
  );

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists lds_dashboard_idx on public.linked_dashboard_shares (dashboard_id);
create index if not exists lds_email_idx     on public.linked_dashboard_shares (collaborator_email);
