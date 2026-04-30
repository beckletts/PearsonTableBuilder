-- migration-v4: Linked dashboards (multi-sheet join feature)
-- Run this in the Supabase SQL editor

-- ── Linked dashboards ────────────────────────────────────────────────────────
create table if not exists public.linked_dashboards (
  id           uuid        default gen_random_uuid() primary key,
  owner_id     uuid        references auth.users not null,
  title        text        not null default 'Untitled Dashboard',
  description  text,
  slug         text        unique not null,
  join_key     text        not null,  -- canonical name for the join column
  config       jsonb       not null default '{}',
  is_published boolean     not null default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.linked_dashboards enable row level security;

create policy "ld_owner_all" on public.linked_dashboards
  for all using (auth.uid() = owner_id);

create policy "ld_public_select" on public.linked_dashboards
  for select using (is_published = true);

-- ── Linked sources (one per uploaded spreadsheet) ────────────────────────────
create table if not exists public.linked_sources (
  id               uuid        default gen_random_uuid() primary key,
  dashboard_id     uuid        references public.linked_dashboards on delete cascade not null,
  name             text        not null,
  join_key_column  text        not null,   -- original column header that is the join key in this sheet
  row_count        integer     not null default 0,
  created_at       timestamptz default now()
);

alter table public.linked_sources enable row level security;

create policy "ls_owner_all" on public.linked_sources
  for all using (
    exists (select 1 from public.linked_dashboards where id = linked_sources.dashboard_id and owner_id = auth.uid())
  );

create policy "ls_public_select" on public.linked_sources
  for select using (
    exists (select 1 from public.linked_dashboards where id = linked_sources.dashboard_id and is_published = true)
  );

-- ── Linked rows (one per source row, keyed by join value) ────────────────────
create table if not exists public.linked_rows (
  id           uuid        default gen_random_uuid() primary key,
  dashboard_id uuid        references public.linked_dashboards on delete cascade not null,
  source_id    uuid        references public.linked_sources on delete cascade not null,
  join_value   text        not null,
  data         jsonb       not null default '{}',
  row_index    integer     not null default 0,
  created_at   timestamptz default now()
);

alter table public.linked_rows enable row level security;

create policy "lr_owner_all" on public.linked_rows
  for all using (
    exists (select 1 from public.linked_dashboards where id = linked_rows.dashboard_id and owner_id = auth.uid())
  );

create policy "lr_public_select" on public.linked_rows
  for select using (
    exists (select 1 from public.linked_dashboards where id = linked_rows.dashboard_id and is_published = true)
  );

-- ── Auto-update timestamps ───────────────────────────────────────────────────
create trigger linked_dashboards_updated_at
  before update on public.linked_dashboards
  for each row execute function public.set_updated_at();

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists ld_owner_idx       on public.linked_dashboards (owner_id);
create index if not exists ld_slug_idx        on public.linked_dashboards (slug);
create index if not exists ls_dashboard_idx   on public.linked_sources (dashboard_id);
create index if not exists lr_dashboard_idx   on public.linked_rows (dashboard_id);
create index if not exists lr_join_value_idx  on public.linked_rows (dashboard_id, join_value);
create index if not exists lr_source_idx      on public.linked_rows (source_id);
