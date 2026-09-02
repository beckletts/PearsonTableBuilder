-- migration-v12: Publishing and sharing for course plans
--
-- Brings course plans up to the same footing as tables and linked dashboards:
--   * a slug and is_published flag, so a plan can be given a public link and
--     embedded on a website;
--   * course_plan_shares, so a plan can be shared with colleagues to view or
--     to edit.
--
-- Run this in the Supabase SQL editor AFTER migration-v11.sql.
-- Safe to run more than once.

-- ── Public link ──────────────────────────────────────────────────────────────

alter table public.course_plans add column if not exists slug text;
alter table public.course_plans add column if not exists is_published boolean not null default false;

-- Backfill a slug for plans created before this migration. Mirrors the app's
-- slugify: lower-case, non-alphanumerics collapsed to hyphens, plus a short
-- suffix so two plans with the same name do not collide.
update public.course_plans
   set slug = left(
         trim(both '-' from regexp_replace(
           lower(coalesce(nullif(trim(title), ''), 'course-plan')), '[^a-z0-9]+', '-', 'g'
         )), 60
       ) || '-' || substr(md5(id::text), 1, 4)
 where slug is null;

-- A plan with a blank title backfills to just the suffix; give it a stem.
update public.course_plans
   set slug = 'course-plan' || slug
 where slug like '-%';

create unique index if not exists course_plans_slug_key on public.course_plans (slug);
alter table public.course_plans alter column slug set not null;

-- Anyone may read a published plan — this is what makes the public link and the
-- embed work for signed-out visitors. RLS still restricts which rows they see.
drop policy if exists "course_plans_public_select" on public.course_plans;
create policy "course_plans_public_select" on public.course_plans
  for select using (is_published = true);

-- Supabase grants these by default for tables created in public, but state it
-- explicitly so a signed-out visitor cannot be blocked at the privilege level
-- before the policy above is even considered. Deliberately not granted on
-- course_plan_shares — collaborator emails are not public.
grant select on public.course_plans to anon, authenticated;

-- ── Sharing with colleagues ──────────────────────────────────────────────────

create table if not exists public.course_plan_shares (
  id                 uuid        default gen_random_uuid() primary key,
  plan_id            uuid        references public.course_plans on delete cascade not null,
  owner_id           uuid        references auth.users not null,
  collaborator_email text        not null,
  access_level       text        not null default 'view' check (access_level in ('view', 'edit')),
  created_at         timestamptz default now(),
  unique (plan_id, collaborator_email)
);

alter table public.course_plan_shares enable row level security;

-- The owner manages the share list.
drop policy if exists "cp_shares_owner_all" on public.course_plan_shares;
create policy "cp_shares_owner_all" on public.course_plan_shares
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- A collaborator can see the shares addressed to their own email, which is how
-- the dashboard finds the plans shared with them.
drop policy if exists "cp_shares_collaborator_select" on public.course_plan_shares;
create policy "cp_shares_collaborator_select" on public.course_plan_shares
  for select using (collaborator_email = (auth.jwt() ->> 'email'));

-- Collaborators can read a plan shared with them, published or not.
drop policy if exists "course_plans_collaborator_select" on public.course_plans;
create policy "course_plans_collaborator_select" on public.course_plans
  for select using (
    exists (
      select 1 from public.course_plan_shares
      where plan_id = course_plans.id
        and collaborator_email = (auth.jwt() ->> 'email')
    )
  );

-- Edit collaborators can change a plan, but only the owner can delete it —
-- there is deliberately no collaborator delete policy.
drop policy if exists "course_plans_collaborator_update" on public.course_plans;
create policy "course_plans_collaborator_update" on public.course_plans
  for update using (
    exists (
      select 1 from public.course_plan_shares
      where plan_id = course_plans.id
        and collaborator_email = (auth.jwt() ->> 'email')
        and access_level = 'edit'
    )
  );

create index if not exists course_plan_shares_plan_idx  on public.course_plan_shares (plan_id);
create index if not exists course_plan_shares_email_idx on public.course_plan_shares (collaborator_email);
