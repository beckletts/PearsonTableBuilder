-- migration-v3: Audit log table
-- Run this in the Supabase SQL editor

create table if not exists public.table_audit_log (
  id          uuid        default gen_random_uuid() primary key,
  table_id    uuid        references public.tables on delete cascade not null,
  user_id     uuid        references auth.users not null,
  user_email  text        not null,
  action      text        not null,
  row_count   integer     not null default 0,
  created_at  timestamptz default now()
);

alter table public.table_audit_log enable row level security;

-- Table owners can view the full audit trail for their tables
create policy "audit_owner_select" on public.table_audit_log
  for select using (
    exists (
      select 1 from public.tables
      where id = table_audit_log.table_id and owner_id = auth.uid()
    )
  );

-- Collaborators can view the audit trail for tables shared with them
create policy "audit_collaborator_select" on public.table_audit_log
  for select using (
    exists (
      select 1 from public.table_shares
      where table_id = table_audit_log.table_id
        and collaborator_email = (auth.jwt() ->> 'email')
    )
  );

-- Authenticated users can only insert entries attributed to themselves
create policy "audit_insert" on public.table_audit_log
  for insert with check (auth.uid() = user_id);

create index if not exists audit_log_table_idx on public.table_audit_log (table_id, created_at desc);
