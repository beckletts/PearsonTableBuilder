-- migration-v11: Course plans for the course builder
--
-- The course builder is a separate feature from the table builder: teachers use
-- it to work through the post-16 Options Guide and assemble a study programme.
-- A plan is small (a handful of chosen qualifications plus notes), so the items
-- live in the config jsonb rather than a child table.
--
-- Safe to run more than once. Run in the Supabase SQL editor.

create table if not exists public.course_plans (
  id          uuid        default gen_random_uuid() primary key,
  owner_id    uuid        references auth.users not null,
  title       text        not null default 'Untitled course plan',
  description text,
  config      jsonb       not null default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.course_plans enable row level security;

-- A plan is private to the teacher who made it. Course plans are never
-- published, so there is no public-select policy here.
drop policy if exists "course_plans_owner_all" on public.course_plans;
create policy "course_plans_owner_all" on public.course_plans
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop trigger if exists course_plans_updated_at on public.course_plans;
create trigger course_plans_updated_at
  before update on public.course_plans
  for each row execute function public.set_updated_at();

create index if not exists course_plans_owner_idx on public.course_plans (owner_id, updated_at desc);
