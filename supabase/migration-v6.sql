-- Built-in analytics: tracks page views and interactions for published tables
-- and linked dashboards. No personal data is stored — session IDs are random
-- UUIDs generated in the browser per tab and are not linked to any user account.

create table if not exists analytics_events (
  id           uuid        primary key default gen_random_uuid(),
  table_id     uuid        references tables(id) on delete cascade,
  dashboard_id uuid        references linked_dashboards(id) on delete cascade,
  event_type   text        not null,
  event_data   jsonb,
  session_id   text        not null,
  created_at   timestamptz default now()
);

alter table analytics_events enable row level security;

-- Anyone (including unauthenticated visitors) can insert events
create policy "public insert analytics" on analytics_events
  for insert to anon, authenticated with check (true);

-- Only the owner of the related table/dashboard can read their own analytics
create policy "owner reads analytics" on analytics_events
  for select using (
    (table_id is not null and exists (
      select 1 from tables
      where tables.id = analytics_events.table_id
        and tables.owner_id = auth.uid()
    ))
    or
    (dashboard_id is not null and exists (
      select 1 from linked_dashboards
      where linked_dashboards.id = analytics_events.dashboard_id
        and linked_dashboards.owner_id = auth.uid()
    ))
  );

create index if not exists analytics_events_table_created
  on analytics_events (table_id, created_at desc);

create index if not exists analytics_events_dash_created
  on analytics_events (dashboard_id, created_at desc);
