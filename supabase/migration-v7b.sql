-- Backfill last_login_at from Supabase's built-in auth tracking
-- and update the RPC to use last_sign_in_at as a fallback.

-- Backfill existing rows where we have no value yet
update public.profiles p
set last_login_at = u.last_sign_in_at
from auth.users u
where p.id = u.id
  and p.last_login_at is null;

-- Update RPC to join auth.users and coalesce both values
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
      coalesce(p.last_login_at, u.last_sign_in_at),
      p.created_at,
      count(distinct t.id)::bigint,
      count(distinct ld.id)::bigint,
      count(ae.id) filter (where ae.event_type = 'page_view')::bigint
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.tables t on t.owner_id = p.id
    left join public.linked_dashboards ld on ld.owner_id = p.id
    left join public.analytics_events ae
      on (ae.table_id = t.id or ae.dashboard_id = ld.id)
    group by p.id, p.full_name, p.email, p.last_login_at, p.created_at, u.last_sign_in_at
    order by coalesce(p.last_login_at, u.last_sign_in_at) desc nulls last;
end;
$$;
