-- Podio Clone: Migration 32 - Bulk import: hundreds of rows per call, one transaction.
-- Per-row automations are intentionally skipped during bulk import (a 2,000-row
-- file should not create 2,000 tasks); one summary activity event is logged.
create or replace function podio.bulk_import_items(p_app uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_ws uuid;
  v_org uuid;
  r jsonb;
  v_item podio.items;
  v_done int := 0;
begin
  if not podio.can_edit_items(podio.app_workspace(p_app)) then
    raise exception 'insufficient role to import';
  end if;
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 500 then
    raise exception 'max 500 rows per batch';
  end if;

  select a.workspace_id, w.organization_id into v_ws, v_org
  from podio.apps a join podio.workspaces w on w.id = a.workspace_id
  where a.id = p_app;

  for r in select * from jsonb_array_elements(p_rows) loop
    if r = '{}'::jsonb then continue; end if;
    insert into podio.items (app_id, created_by, updated_by)
    values (p_app, auth.uid(), auth.uid())
    returning * into v_item;
    perform podio.write_values(p_app, v_item.id, r, auth.uid());
    v_done := v_done + 1;
  end loop;

  if v_done > 0 then
    insert into podio.activity_events
      (organization_id, workspace_id, app_id, actor_id, event_type, target_type, target_id, payload)
    values (v_org, v_ws, p_app, auth.uid(), 'items_imported', 'app', p_app,
      jsonb_build_object('count', v_done));
  end if;

  return jsonb_build_object('imported', v_done);
end $$;
grant execute on function podio.bulk_import_items(uuid, jsonb) to authenticated;
