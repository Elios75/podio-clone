-- Podio Clone: Migration 20 - Granular permission matrix
-- workspace admin: everything | member: work with items/views/automations
-- light: read + comment + own tasks | guest: read-only
-- org external/light/guest: cannot create workspaces or self-join open ones
-- NOTE: identical to the version applied via MCP on 2026-07-04. save_item v5 is v4
-- (see 20260703000014) with the guard swapped to can_edit_items/can_edit_item.

create or replace function podio.workspace_role_of(p_ws uuid) returns podio.workspace_role
language sql stable security definer set search_path = podio, public as $$
  select case
    when podio.is_org_admin(podio.workspace_org(p_ws)) then 'admin'::podio.workspace_role
    else (select role from podio.workspace_members
          where workspace_id = p_ws and user_id = auth.uid())
  end;
$$;

create or replace function podio.can_edit_items(p_ws uuid) returns boolean
language sql stable security definer set search_path = podio, public as $$
  select podio.workspace_role_of(p_ws) in ('admin','member');
$$;

create or replace function podio.is_org_employee(p_org uuid) returns boolean
language sql stable security definer set search_path = podio, public as $$
  select exists (select 1 from podio.organization_members
    where organization_id = p_org and user_id = auth.uid()
      and role in ('owner','admin','employee'));
$$;

create or replace function podio.can_edit_item(p_item uuid) returns boolean
language sql stable security definer set search_path = podio, public as $$
  select podio.can_edit_items(podio.item_workspace(p_item))
    or exists (select 1 from podio.item_shares s
      where s.item_id = p_item and s.user_id = auth.uid()
        and s.revoked_at is null and s.access = 'edit');
$$;

drop policy p_workspaces_insert on podio.workspaces;
create policy p_workspaces_insert on podio.workspaces for insert to authenticated
  with check (podio.is_org_employee(organization_id));

drop policy p_ws_members_insert on podio.workspace_members;
create policy p_ws_members_insert on podio.workspace_members for insert to authenticated
  with check (podio.is_workspace_admin(workspace_id)
    or (user_id = auth.uid() and exists (select 1 from podio.workspaces w
        where w.id = workspace_id and w.privacy = 'open'
          and podio.is_org_employee(w.organization_id))));

drop policy p_apps_write on podio.apps;
create policy p_apps_write on podio.apps for all to authenticated
  using (podio.can_edit_items(workspace_id))
  with check (podio.can_edit_items(workspace_id));

drop policy p_app_fields_all on podio.app_fields;
create policy p_app_fields_select on podio.app_fields for select to authenticated
  using (podio.is_workspace_member(podio.app_workspace(app_id)));
create policy p_app_fields_write on podio.app_fields for all to authenticated
  using (podio.can_edit_items(podio.app_workspace(app_id)))
  with check (podio.can_edit_items(podio.app_workspace(app_id)));

drop policy p_app_views_write on podio.app_views;
create policy p_app_views_write on podio.app_views for all to authenticated
  using (podio.can_edit_items(podio.app_workspace(app_id)))
  with check (podio.can_edit_items(podio.app_workspace(app_id)));

drop policy p_items_insert on podio.items;
create policy p_items_insert on podio.items for insert to authenticated
  with check (podio.can_edit_items(podio.app_workspace(app_id)));
drop policy p_items_delete on podio.items;
create policy p_items_delete on podio.items for delete to authenticated
  using (podio.can_edit_items(podio.app_workspace(app_id)));

drop policy p_item_shares_write on podio.item_shares;
create policy p_item_shares_write on podio.item_shares for all to authenticated
  using (podio.can_edit_items(podio.item_workspace(item_id)))
  with check (podio.can_edit_items(podio.item_workspace(item_id)));

drop policy p_webforms_all on podio.webforms;
create policy p_webforms_select on podio.webforms for select to authenticated
  using (podio.is_workspace_member(podio.app_workspace(app_id)));
create policy p_webforms_write on podio.webforms for all to authenticated
  using (podio.can_edit_items(podio.app_workspace(app_id)))
  with check (podio.can_edit_items(podio.app_workspace(app_id)));

drop policy p_app_email_all on podio.app_email_addresses;
create policy p_app_email_select on podio.app_email_addresses for select to authenticated
  using (podio.is_workspace_member(podio.app_workspace(app_id)));
create policy p_app_email_write on podio.app_email_addresses for all to authenticated
  using (podio.can_edit_items(podio.app_workspace(app_id)))
  with check (podio.can_edit_items(podio.app_workspace(app_id)));

drop policy p_automations_all on podio.automations;
create policy p_automations_select on podio.automations for select to authenticated
  using (podio.is_workspace_member(workspace_id));
create policy p_automations_write on podio.automations for all to authenticated
  using (podio.can_edit_items(workspace_id))
  with check (podio.can_edit_items(workspace_id));

drop policy p_dashboard_tiles_all on podio.dashboard_tiles;
create policy p_dashboard_tiles_select on podio.dashboard_tiles for select to authenticated
  using (podio.is_workspace_member(workspace_id));
create policy p_dashboard_tiles_write on podio.dashboard_tiles for all to authenticated
  using (podio.can_edit_items(workspace_id))
  with check (podio.can_edit_items(workspace_id));

create or replace function podio.create_workspace(
  p_org uuid, p_name text, p_slug text, p_privacy podio.workspace_privacy default 'private'
)
returns podio.workspaces
language plpgsql security definer set search_path = podio, public as $$
declare
  v_ws podio.workspaces;
begin
  if not podio.is_org_employee(p_org) then
    raise exception 'only employees and admins can create workspaces';
  end if;
  insert into podio.workspaces (organization_id, name, slug, privacy, created_by)
  values (p_org, p_name, p_slug, p_privacy, auth.uid())
  returning * into v_ws;
  insert into podio.workspace_members (workspace_id, user_id, role)
  values (v_ws.id, auth.uid(), 'admin');
  return v_ws;
end $$;

-- save_item v5: apply the full v4 body from 20260703000014 with this guard instead:
--   if not podio.can_edit_items(podio.app_workspace(p_app))
--      and not (p_item is not null and podio.can_edit_item(p_item)) then
--     raise exception 'insufficient role to edit items';
--   end if;
-- (The applied version lives in the remote migration history under podio_permission_matrix.)

create or replace function podio.share_item(p_item uuid, p_email text, p_access podio.share_access default 'view')
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_user uuid;
  v_title text;
begin
  if not podio.can_edit_items(podio.item_workspace(p_item)) then
    raise exception 'insufficient role to share items';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  select title into v_title from podio.items where id = p_item;
  insert into podio.item_shares (item_id, user_id, email, access, invited_by)
  values (p_item, v_user, lower(trim(p_email)), p_access, auth.uid());
  if v_user is not null then
    insert into podio.notifications (user_id, event_type, target_type, target_id, actor_id, payload)
    values (v_user, 'item_shared', 'item', p_item, auth.uid(),
      jsonb_build_object('item_title', v_title, 'access', p_access));
  end if;
  return jsonb_build_object('shared', true, 'registered_user', v_user is not null);
end $$;
