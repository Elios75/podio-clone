-- Podio Clone: Migration 34 - Hard-delete an app and everything under it.
-- Requires workspace admin (stricter than the member-level edit rights).
-- FK cascades remove items, field values, relationships, views, comments,
-- tasks, automations, webforms, etc. Storage objects for file fields are NOT
-- purged here (a storage sweep is a separate janitor job).
create or replace function podio.delete_app(p_app uuid, p_confirm_name text)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_app podio.apps;
  v_items int;
begin
  select * into v_app from podio.apps where id = p_app;
  if v_app.id is null then
    raise exception 'app not found';
  end if;
  if not podio.is_workspace_admin(v_app.workspace_id) then
    raise exception 'only workspace admins can delete an app';
  end if;
  if p_confirm_name is distinct from v_app.name then
    raise exception 'confirmation name does not match';
  end if;

  select count(*) into v_items from podio.items where app_id = p_app;

  insert into podio.audit_logs
    (organization_id, workspace_id, actor_id, action, target_type, target_id, metadata)
  select w.organization_id, v_app.workspace_id, auth.uid(), 'apps.delete', 'apps', p_app,
    jsonb_build_object('name', v_app.name, 'items_deleted', v_items)
  from podio.workspaces w where w.id = v_app.workspace_id;

  delete from podio.apps where id = p_app;  -- cascades

  return jsonb_build_object('deleted', true, 'items_deleted', v_items);
end $$;
grant execute on function podio.delete_app(uuid, text) to authenticated;
