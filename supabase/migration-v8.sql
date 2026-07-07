-- migration-v8: Table snapshots (rollback / version history)
-- Captures the live state of a table (config + rows) just before it is
-- overwritten by a republish or a restore, so owners can roll back if they
-- publish incorrect data. Run this in the Supabase SQL editor.

create table if not exists public.table_snapshots (
  id          uuid        default gen_random_uuid() primary key,
  table_id    uuid        references public.tables on delete cascade not null,
  created_by  uuid        references auth.users,
  user_email  text        not null default '',
  reason      text        not null default '',
  config      jsonb       not null default '{}',
  rows        jsonb       not null default '[]',
  row_count   integer     not null default 0,
  created_at  timestamptz default now()
);

alter table public.table_snapshots enable row level security;

-- Table owners can view, restore from, insert and prune their own snapshots
drop policy if exists "snapshots_owner_select" on public.table_snapshots;
create policy "snapshots_owner_select" on public.table_snapshots
  for select using (
    exists (
      select 1 from public.tables
      where id = table_snapshots.table_id and owner_id = auth.uid()
    )
  );

drop policy if exists "snapshots_owner_insert" on public.table_snapshots;
create policy "snapshots_owner_insert" on public.table_snapshots
  for insert with check (
    exists (
      select 1 from public.tables
      where id = table_snapshots.table_id and owner_id = auth.uid()
    )
  );

drop policy if exists "snapshots_owner_delete" on public.table_snapshots;
create policy "snapshots_owner_delete" on public.table_snapshots
  for delete using (
    exists (
      select 1 from public.tables
      where id = table_snapshots.table_id and owner_id = auth.uid()
    )
  );

-- Collaborators with edit access can also snapshot / restore
drop policy if exists "snapshots_collaborator_select" on public.table_snapshots;
create policy "snapshots_collaborator_select" on public.table_snapshots
  for select using (
    exists (
      select 1 from public.table_shares
      where table_id = table_snapshots.table_id
        and collaborator_email = (auth.jwt() ->> 'email')
    )
  );

drop policy if exists "snapshots_collaborator_insert" on public.table_snapshots;
create policy "snapshots_collaborator_insert" on public.table_snapshots
  for insert with check (
    exists (
      select 1 from public.table_shares
      where table_id = table_snapshots.table_id
        and collaborator_email = (auth.jwt() ->> 'email')
    )
  );

create index if not exists snapshots_table_idx on public.table_snapshots (table_id, created_at desc);
