-- ── v14: super admin "view as" ───────────────────────────────────────────────
--
-- A super admin can already see per-user totals through admin_user_stats(), but
-- nothing shows which of a colleague's tables are actually being used, and there
-- is no way to add a collaborator to a table you do not own. That left covering
-- someone's leave as a hand-written SQL job.
--
-- These functions read and act on another user's tables without becoming them:
-- every change is attributed to the admin who made it in table_audit_log, and
-- a share is always recorded under the table's real owner so they keep control
-- of it when they return.

-- ── Per-table view counts for one user's tables ──────────────────────────────

create or replace function public.admin_list_user_tables(p_user_id uuid)
returns table (
  id              uuid,
  title           text,
  slug            text,
  description     text,
  is_published    boolean,
  tab_group_id    uuid,
  column_count    integer,
  row_count       bigint,
  views_all_time  bigint,
  views_90d       bigint,
  last_viewed_at  timestamptz,
  updated_at      timestamptz,
  shared_with     text[]
) language plpgsql security definer as $$
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super admin only';
  end if;

  return query
    select
      t.id,
      t.title,
      t.slug,
      t.description,
      t.is_published,
      t.tab_group_id,
      case when jsonb_typeof(t.config -> 'columns') = 'array'
           then jsonb_array_length(t.config -> 'columns') else 0 end::integer,
      (select count(*) from public.table_rows r where r.table_id = t.id),
      (select count(*) from public.analytics_events ae
        where ae.table_id = t.id and ae.event_type = 'page_view'),
      (select count(*) from public.analytics_events ae
        where ae.table_id = t.id and ae.event_type = 'page_view'
          and ae.created_at > now() - interval '90 days'),
      (select max(ae.created_at) from public.analytics_events ae
        where ae.table_id = t.id and ae.event_type = 'page_view'),
      t.updated_at,
      coalesce(
        (select array_agg(s.collaborator_email order by s.collaborator_email)
           from public.table_shares s where s.table_id = t.id),
        '{}'::text[]
      )
    from public.tables t
    where t.owner_id = p_user_id
    order by
      (select count(*) from public.analytics_events ae
        where ae.table_id = t.id and ae.event_type = 'page_view'
          and ae.created_at > now() - interval '90 days') desc,
      t.updated_at desc;
end;
$$;

-- ── Add a collaborator to a table you do not own ─────────────────────────────

create or replace function public.admin_share_table(p_table_id uuid, p_email text)
returns void language plpgsql security definer as $$
declare
  v_owner  uuid;
  v_email  text := lower(trim(p_email));
  v_domain text := split_part(v_email, '@', 2);
  v_actor  text;
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super admin only';
  end if;

  -- The same allow-list the rest of the app enforces, applied here too so an
  -- admin route cannot let an outside address in by the back door.
  if v_domain not in ('pearson.com', 'pearsoncanada.com', 'pearsoned.com') then
    raise exception 'Only Pearson email addresses can be given access';
  end if;

  select owner_id into v_owner from public.tables where id = p_table_id;
  if v_owner is null then
    raise exception 'Table not found';
  end if;

  -- Recorded under the table's owner, not the admin, so the owner sees it in
  -- their own share list and can remove it.
  insert into public.table_shares (table_id, owner_id, collaborator_email)
  values (p_table_id, v_owner, v_email)
  on conflict (table_id, collaborator_email) do nothing;

  -- Attributed to the admin who did it, never to the owner.
  select p.email into v_actor from public.profiles p where p.id = auth.uid();
  insert into public.table_audit_log (table_id, user_id, user_email, action, row_count)
  values (p_table_id, auth.uid(), coalesce(v_actor, 'super admin'), 'admin_share:' || v_email, 0);
end;
$$;

create or replace function public.admin_unshare_table(p_table_id uuid, p_email text)
returns void language plpgsql security definer as $$
declare
  v_email text := lower(trim(p_email));
  v_actor text;
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super admin only';
  end if;

  delete from public.table_shares
   where table_id = p_table_id and collaborator_email = v_email;

  select p.email into v_actor from public.profiles p where p.id = auth.uid();
  insert into public.table_audit_log (table_id, user_id, user_email, action, row_count)
  values (p_table_id, auth.uid(), coalesce(v_actor, 'super admin'), 'admin_unshare:' || v_email, 0);
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- Each function checks is_super_admin() itself; authenticated is the role the
-- app calls with, and anon must never reach them.

revoke execute on function public.admin_list_user_tables(uuid) from public, anon;
revoke execute on function public.admin_share_table(uuid, text) from public, anon;
revoke execute on function public.admin_unshare_table(uuid, text) from public, anon;

grant execute on function public.admin_list_user_tables(uuid)   to authenticated;
grant execute on function public.admin_share_table(uuid, text)  to authenticated;
grant execute on function public.admin_unshare_table(uuid, text) to authenticated;

alter function public.admin_list_user_tables(uuid)   set search_path = public;
alter function public.admin_share_table(uuid, text)  set search_path = public;
alter function public.admin_unshare_table(uuid, text) set search_path = public;
