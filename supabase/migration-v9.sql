-- migration-v9: Transfer ownership of tables and linked dashboards
--
-- Ownership lives in owner_id, but the RLS policies (tables_owner_all,
-- linked_dashboards owner policies) use `auth.uid() = owner_id`, whose implicit
-- WITH CHECK blocks a client from re-pointing owner_id at anyone else. So all
-- transfers go through these security-definer RPCs, which authorise the caller
-- (current owner OR super admin) and then bypass RLS to reassign ownership.
--
-- The new owner must already have a profile — i.e. they have signed in to the
-- platform at least once (their email is stored on profiles by migration-v7).
--
-- Run this in the Supabase SQL editor.

-- ── Transfer a single table (and its whole tab group) ────────────────────────

create or replace function public.transfer_table_ownership(
  p_table_id       uuid,
  p_new_owner_email text,
  p_keep_access    boolean default false
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
  v_group_root    uuid;
  v_ids           uuid[];
begin
  -- Load the table and resolve the root of its tab group.
  select owner_id, coalesce(tab_group_id, id)
    into v_current_owner, v_group_root
    from public.tables
   where id = p_table_id;

  if v_current_owner is null then
    raise exception 'Table not found';
  end if;

  -- Only the current owner or a super admin may transfer.
  if v_caller <> v_current_owner and not public.is_super_admin() then
    raise exception 'Only the table owner or a super admin can transfer this table';
  end if;

  -- Resolve the recipient from their profile.
  select id into v_new_owner
    from public.profiles
   where lower(email) = v_new_email;

  if v_new_owner is null then
    raise exception 'No account found for %. They must sign in to the platform at least once before a table can be transferred to them.', v_new_email;
  end if;

  if v_new_owner = v_current_owner then
    raise exception 'That person already owns this table';
  end if;

  -- Every table in the group: the primary plus its secondary tabs.
  select array_agg(id) into v_ids
    from public.tables
   where id = v_group_root or tab_group_id = v_group_root;

  select email into v_old_email from public.profiles where id = v_current_owner;

  -- Reassign ownership across the whole group.
  update public.tables       set owner_id = v_new_owner where id = any(v_ids);
  -- Existing share rows must follow the new owner so they can manage sharing.
  update public.table_shares set owner_id = v_new_owner where table_id = any(v_ids);

  -- If the recipient was previously a collaborator, that share is now redundant.
  delete from public.table_shares
   where table_id = any(v_ids) and lower(collaborator_email) = v_new_email;

  -- Optionally keep the previous owner on as an edit collaborator.
  if p_keep_access and v_old_email is not null then
    insert into public.table_shares (table_id, owner_id, collaborator_email)
    select unnest(v_ids), v_new_owner, v_old_email
    on conflict (table_id, collaborator_email) do nothing;
  end if;
end;
$$;

grant execute on function public.transfer_table_ownership(uuid, text, boolean) to authenticated;


-- ── Transfer a single linked dashboard ───────────────────────────────────────

create or replace function public.transfer_dashboard_ownership(
  p_dashboard_id    uuid,
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
  select owner_id into v_current_owner
    from public.linked_dashboards
   where id = p_dashboard_id;

  if v_current_owner is null then
    raise exception 'Dashboard not found';
  end if;

  if v_caller <> v_current_owner and not public.is_super_admin() then
    raise exception 'Only the dashboard owner or a super admin can transfer this dashboard';
  end if;

  select id into v_new_owner
    from public.profiles
   where lower(email) = v_new_email;

  if v_new_owner is null then
    raise exception 'No account found for %. They must sign in to the platform at least once before a dashboard can be transferred to them.', v_new_email;
  end if;

  if v_new_owner = v_current_owner then
    raise exception 'That person already owns this dashboard';
  end if;

  select email into v_old_email from public.profiles where id = v_current_owner;

  update public.linked_dashboards       set owner_id = v_new_owner where id = p_dashboard_id;
  update public.linked_dashboard_shares set owner_id = v_new_owner where dashboard_id = p_dashboard_id;

  delete from public.linked_dashboard_shares
   where dashboard_id = p_dashboard_id and lower(collaborator_email) = v_new_email;

  if p_keep_access and v_old_email is not null then
    insert into public.linked_dashboard_shares (dashboard_id, owner_id, collaborator_email, access_level)
    values (p_dashboard_id, v_new_owner, v_old_email, 'edit')
    on conflict (dashboard_id, collaborator_email) do nothing;
  end if;
end;
$$;

grant execute on function public.transfer_dashboard_ownership(uuid, text, boolean) to authenticated;


-- ── Admin: reassign EVERYTHING a (departed) user owns ────────────────────────
-- Super-admin only. Moves every table and linked dashboard owned by p_from_user
-- to the recipient in one call — the leaver-proofing path. Returns the counts
-- moved so the UI can confirm.

create or replace function public.admin_transfer_all_ownership(
  p_from_user       uuid,
  p_new_owner_email text
) returns table (tables_moved integer, dashboards_moved integer)
language plpgsql security definer
set search_path = public
as $$
declare
  v_new_owner uuid;
  v_new_email text := lower(trim(p_new_owner_email));
begin
  if not public.is_super_admin() then
    raise exception 'Access denied: super admin only';
  end if;

  select id into v_new_owner
    from public.profiles
   where lower(email) = v_new_email;

  if v_new_owner is null then
    raise exception 'No account found for %. They must sign in to the platform at least once.', v_new_email;
  end if;

  if v_new_owner = p_from_user then
    raise exception 'Source and destination users are the same';
  end if;

  with moved as (
    update public.tables set owner_id = v_new_owner
     where owner_id = p_from_user
    returning id
  )
  select count(*)::integer into tables_moved from moved;

  update public.table_shares set owner_id = v_new_owner where owner_id = p_from_user;
  -- Drop shares that would now point the new owner at their own content.
  delete from public.table_shares
   where owner_id = v_new_owner and lower(collaborator_email) = v_new_email;

  with moved as (
    update public.linked_dashboards set owner_id = v_new_owner
     where owner_id = p_from_user
    returning id
  )
  select count(*)::integer into dashboards_moved from moved;

  update public.linked_dashboard_shares set owner_id = v_new_owner where owner_id = p_from_user;
  delete from public.linked_dashboard_shares
   where owner_id = v_new_owner and lower(collaborator_email) = v_new_email;

  return next;
end;
$$;

grant execute on function public.admin_transfer_all_ownership(uuid, text) to authenticated;
