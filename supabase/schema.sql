-- Pearson Table Builder — Supabase schema
-- Run in Supabase SQL editor after creating your project

-- ── Profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid        references auth.users on delete cascade primary key,
  full_name  text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles_owner_all" on public.profiles
  for all using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Enforce Pearson email domain — delete non-Pearson signups
create or replace function public.enforce_pearson_email()
returns trigger language plpgsql security definer as $$
begin
  if new.email not like '%@pearson.com' then
    delete from auth.users where id = new.id;
    raise exception 'Only @pearson.com email addresses are permitted.';
  end if;
  return new;
end;
$$;

create trigger enforce_pearson_email_trigger
  after insert on auth.users
  for each row execute procedure public.enforce_pearson_email();


-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.tables (
  id           uuid        default gen_random_uuid() primary key,
  owner_id     uuid        references auth.users not null,
  title        text        not null default 'Untitled Table',
  description  text,
  slug         text        unique not null,
  config       jsonb       not null default '{}',
  is_published boolean     not null default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.tables enable row level security;

create policy "tables_owner_all" on public.tables
  for all using (auth.uid() = owner_id);

create policy "tables_public_select" on public.tables
  for select using (is_published = true);


-- ── Table rows ───────────────────────────────────────────────────────────────
create table if not exists public.table_rows (
  id         uuid        default gen_random_uuid() primary key,
  table_id   uuid        references public.tables on delete cascade not null,
  data       jsonb       not null default '{}',
  row_index  integer     not null default 0,
  created_at timestamptz default now()
);

alter table public.table_rows enable row level security;

create policy "table_rows_owner_all" on public.table_rows
  for all using (
    exists (
      select 1 from public.tables
      where id = table_rows.table_id and owner_id = auth.uid()
    )
  );

create policy "table_rows_public_select" on public.table_rows
  for select using (
    exists (
      select 1 from public.tables
      where id = table_rows.table_id and is_published = true
    )
  );


-- ── Timestamps ───────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tables_updated_at
  before update on public.tables
  for each row execute function public.set_updated_at();


-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists tables_owner_idx     on public.tables (owner_id);
create index if not exists tables_slug_idx      on public.tables (slug);
create index if not exists table_rows_table_idx on public.table_rows (table_id);
create index if not exists table_rows_order_idx on public.table_rows (table_id, row_index);
create index if not exists table_rows_data_gin  on public.table_rows using gin (data);
