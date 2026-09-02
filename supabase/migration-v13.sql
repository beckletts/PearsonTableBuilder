-- migration-v13: Analytics, history and ownership transfer for course builders
--
-- Completes the parity with tables and linked dashboards, so a published course
-- builder carries the same option set on the dashboard:
--   * analytics_events gains a course_plan_id, so views and interactions on a
--     shared builder are counted the same way;
--   * course_plan_audit_log records publish/unpublish, for the History view;
--   * transfer_course_plan_ownership moves a builder to a new owner.
--
-- Note on naming: the stored entity is still `course_plans` from v11. In the UI
-- each row is presented as a "course builder" — a publishable, embeddable tool —
-- rather than a single fixed plan. The table keeps its original name so live
-- rows, shares and foreign keys are not disturbed.
--
-- Run this in the Supabase SQL editor AFTER migration-v12.sql.
-- Safe to run more than once.

-- ── Analytics ────────────────────────────────────────────────────────────────

alter table public.analytics_events
  add column if not exists course_plan_id uuid references public.course_plans on delete cascade;

-- Policies OR together, so this sits alongside the table/dashboard read policy
-- from v6 rather than replacing it.
drop policy if exists "owner reads course plan analytics" on public.analytics_events;
create policy "owner reads course plan analytics" on public.analytics_events
  for select using (
    exists (
      select 1 from public.course_plans
      where course_plans.id = analytics_events.course_plan_id
        and course_plans.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.course_plan_shares
      where course_plan_shares.plan_id = analytics_events.course_plan_id
        and course_plan_shares.collaborator_email = (auth.jwt() ->> 'email')
    )
  );

create index if not exists analytics_events_course_plan_created
  on public.analytics_events (course_plan_id, created_at desc);

-- ── History ──────────────────────────────────────────────────────────────────

create table if not exists public.course_plan_audit_log (
  id         uuid        default gen_random_uuid() primary key,
  plan_id    uuid        references public.course_plans on delete cascade not null,
  user_id    uuid        references auth.users not null,
  user_email text        not null,
  action     text        not null,
  created_at timestamptz default now()
);

alter table public.course_plan_audit_log enable row level security;

drop policy if exists "cp_audit_owner_select" on public.course_plan_audit_log;
create policy "cp_audit_owner_select" on public.course_plan_audit_log
  for select using (
    exists (
      select 1 from public.course_plans
      where id = course_plan_audit_log.plan_id and owner_id = auth.uid()
    )
  );

drop policy if exists "cp_audit_collaborator_select" on public.course_plan_audit_log;
create policy "cp_audit_collaborator_select" on public.course_plan_audit_log
  for select using (
    exists (
      select 1 from public.course_plan_shares
      where plan_id = course_plan_audit_log.plan_id
        and collaborator_email = (auth.jwt() ->> 'email')
    )
  );

-- Entries may only be attributed to the person making them.
drop policy if exists "cp_audit_insert" on public.course_plan_audit_log;
create policy "cp_audit_insert" on public.course_plan_audit_log
  for insert with check (auth.uid() = user_id);

create index if not exists cp_audit_log_plan_idx
  on public.course_plan_audit_log (plan_id, created_at desc);

-- ── Ownership transfer ───────────────────────────────────────────────────────
-- Mirrors transfer_dashboard_ownership as hardened in v10: an explicit
-- null-caller guard, a pinned search_path, and no execute for anon.

create or replace function public.transfer_course_plan_ownership(
  p_plan_id         uuid,
  p_new_owner_email text,
  p_keep_access     boolean default false
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_caller        uuid := auth.uid();
  v_current_owner uuid;
  v_new_owner     uuid;
  v_new_email     text := lower(trim(p_new_owner_email));
  v_old_email     text;
begin
  if v_caller is null then
    raise exception 'You must be signed in to transfer ownership';
  end if;

  select owner_id into v_current_owner
    from public.course_plans
   where id = p_plan_id;

  if v_current_owner is null then
    raise exception 'Course builder not found';
  end if;

  if v_caller <> v_current_owner and not public.is_super_admin() then
    raise exception 'Only the owner or a super admin can transfer this course builder';
  end if;

  select id into v_new_owner
    from public.profiles
   where lower(email) = v_new_email;

  if v_new_owner is null then
    raise exception 'No account found for %. They must sign in to the platform at least once before a course builder can be transferred to them.', v_new_email;
  end if;

  if v_new_owner = v_current_owner then
    raise exception 'That person already owns this course builder';
  end if;

  select email into v_old_email from public.profiles where id = v_current_owner;

  update public.course_plans       set owner_id = v_new_owner where id = p_plan_id;
  update public.course_plan_shares set owner_id = v_new_owner where plan_id = p_plan_id;

  -- The new owner does not need a share row pointing at themselves.
  delete from public.course_plan_shares
   where plan_id = p_plan_id and lower(collaborator_email) = v_new_email;

  if p_keep_access and v_old_email is not null then
    insert into public.course_plan_shares (plan_id, owner_id, collaborator_email, access_level)
    values (p_plan_id, v_new_owner, v_old_email, 'edit')
    on conflict (plan_id, collaborator_email) do nothing;
  end if;
end;
$$;

revoke execute on function public.transfer_course_plan_ownership(uuid, text, boolean) from public, anon;
grant  execute on function public.transfer_course_plan_ownership(uuid, text, boolean) to authenticated;
