-- migration-v10: Security hardening (fixes an auth-bypass in the transfer RPCs)
--
-- 1. transfer_table_ownership / transfer_dashboard_ownership had a NULL-caller
--    hole: for an anonymous request auth.uid() is NULL, so
--    `v_caller <> v_current_owner and not is_super_admin()` evaluated to NULL
--    (falsy) and the ownership check was skipped. An unauthenticated caller who
--    knew a table/dashboard id could reassign it. We now reject NULL callers
--    explicitly AND revoke EXECUTE from the anon role.
-- 2. Revoke the default PUBLIC execute on privileged functions so only signed-in
--    users can reach them (defence in depth; the internal guards still stand).
-- 3. Pin search_path on the six functions flagged by the linter.
--
-- Safe to run more than once. Run in the Supabase SQL editor.

-- ── 1 + 2: Recreate the transfer RPCs with a NULL-caller guard ────────────────

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
  if v_caller is null then
    raise exception 'You must be signed in to transfer ownership';
  end if;

  select owner_id, coalesce(tab_group_id, id)
    into v_current_owner, v_group_root
    from public.tables
   where id = p_table_id;

  if v_current_owner is null then
    raise exception 'Table not found';
  end if;

  if v_caller <> v_current_owner and not public.is_super_admin() then
    raise exception 'Only the table owner or a super admin can transfer this table';
  end if;

  select id into v_new_owner
    from public.profiles
   where lower(email) = v_new_email;

  if v_new_owner is null then
    raise exception 'No account found for %. They must sign in to the platform at least once before a table can be transferred to them.', v_new_email;
  end if;

  if v_new_owner = v_current_owner then
    raise exception 'That person already owns this table';
  end if;

  select array_agg(id) into v_ids
    from public.tables
   where id = v_group_root or tab_group_id = v_group_root;

  select email into v_old_email from public.profiles where id = v_current_owner;

  update public.tables       set owner_id = v_new_owner where id = any(v_ids);
  update public.table_shares set owner_id = v_new_owner where table_id = any(v_ids);

  delete from public.table_shares
   where table_id = any(v_ids) and lower(collaborator_email) = v_new_email;

  if p_keep_access and v_old_email is not null then
    insert into public.table_shares (table_id, owner_id, collaborator_email)
    select unnest(v_ids), v_new_owner, v_old_email
    on conflict (table_id, collaborator_email) do nothing;
  end if;
end;
$$;

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
  if v_caller is null then
    raise exception 'You must be signed in to transfer ownership';
  end if;

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

-- ── Lock privileged functions to signed-in users only ────────────────────────
-- Revoking from PUBLIC drops the implicit anon grant; re-grant to authenticated.

revoke execute on function public.transfer_table_ownership(uuid, text, boolean)     from public, anon;
revoke execute on function public.transfer_dashboard_ownership(uuid, text, boolean) from public, anon;
revoke execute on function public.admin_transfer_all_ownership(uuid, text)          from public, anon;
revoke execute on function public.admin_user_stats()                                from public, anon;

grant execute on function public.transfer_table_ownership(uuid, text, boolean)     to authenticated;
grant execute on function public.transfer_dashboard_ownership(uuid, text, boolean) to authenticated;
grant execute on function public.admin_transfer_all_ownership(uuid, text)          to authenticated;
grant execute on function public.admin_user_stats()                                to authenticated;

-- Trigger functions are invoked by the trigger as the table owner and never need
-- to be callable over the API — remove their PUBLIC execute entirely.
revoke execute on function public.handle_new_user()      from public, anon;
revoke execute on function public.enforce_pearson_email() from public, anon;
revoke execute on function public.set_updated_at()       from public, anon;

-- ── 3: Pin search_path on the flagged functions ──────────────────────────────

alter function public.enforce_pearson_email()            set search_path = public;
alter function public.set_updated_at()                   set search_path = public;
alter function public.is_parent_table_published(uuid)    set search_path = public;
alter function public.handle_new_user()                  set search_path = public;
alter function public.is_super_admin()                   set search_path = public;
alter function public.admin_user_stats()                 set search_path = public;
