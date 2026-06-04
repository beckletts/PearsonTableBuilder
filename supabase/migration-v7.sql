-- Super admin: adds role flag, email, last_login_at to profiles
-- and an RPC that returns aggregated user stats for the admin panel.

-- ── Extend profiles ──────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists email          text,
  add column if not exists is_super_admin boolean not null default false,
  add column if not exists last_login_at  timestamptz;

-- Backfill emails from auth.users for existing rows
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Store email on new signups
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email
  )
  on conflict do nothing;
  return new;
end;
$$;

-- ── Helper: check if the current user is a super admin ───────────────────────
-- Security definer so it bypasses RLS when reading profiles (avoids recursion).

create or replace function public.is_super_admin()
returns boolean language plpgsql security definer as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and is_super_admin = true
  );
end;
$$;

grant execute on function public.is_super_admin() to authenticated;

-- ── RLS: super admin can read all profiles ───────────────────────────────────

create policy "profiles_superadmin_select" on public.profiles
  for select using (public.is_super_admin());

-- ── RPC: aggregated stats for the admin panel ────────────────────────────────

create or replace function public.admin_user_stats()
returns table (
  user_id         uuid,
  full_name       text,
  email           text,
  last_login_at   timestamptz,
  joined_at       timestamptz,
  table_count     bigint,
  dashboard_count bigint,
  total_views     bigint
) language plpgsql security definer as $$
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super admin only';
  end if;

  return query
    select
      p.id,
      p.full_name,
      p.email,
      p.last_login_at,
      p.created_at,
      count(distinct t.id)::bigint,
      count(distinct ld.id)::bigint,
      count(ae.id) filter (where ae.event_type = 'page_view')::bigint
    from public.profiles p
    left join public.tables t        on t.owner_id  = p.id
    left join public.linked_dashboards ld on ld.owner_id = p.id
    left join public.analytics_events ae
      on (ae.table_id = t.id or ae.dashboard_id = ld.id)
    group by p.id, p.full_name, p.email, p.last_login_at, p.created_at
    order by p.last_login_at desc nulls last;
end;
$$;

grant execute on function public.admin_user_stats() to authenticated;

-- ── Grant your account super admin ───────────────────────────────────────────
-- Find your auth user ID in Supabase > Authentication > Users, then run:
--
--   update public.profiles set is_super_admin = true where id = '<your-uuid>';
