-- Podio Clone: Migration 52 - Item Actions menu RPCs
--
-- Backs the record view's "Actions" dropdown (Clone / Refresh Calculations /
-- Delete). Each function is SECURITY DEFINER and re-checks workspace membership
-- itself (mirroring save_item), so the client can call them directly.
--
-- Print, Email-to-item, Download-all-files and Developer Info are handled
-- client-side and need no server function.

-- clone_item: deep-copy an item within its own app. Copies every field value
-- and every outgoing relationship edge verbatim (no value-shape reconstruction,
-- so money/date/file/relationship shapes are preserved exactly), recomputes
-- calculation fields on the copy, auto-follows the creator, and logs an
-- item_created activity event tagged with the source item number.
create or replace function podio.clone_item(p_item uuid)
returns podio.items
language plpgsql security definer set search_path = podio, public as $$
declare
  v_src podio.items;
  v_new podio.items;
  v_ws uuid; v_org uuid;
begin
  select * into v_src from podio.items where id = p_item and not is_deleted;
  if v_src.id is null then
    raise exception 'item not found';
  end if;
  if not podio.is_workspace_member(podio.app_workspace(v_src.app_id)) then
    raise exception 'not a workspace member';
  end if;

  insert into podio.items (app_id, title, created_by, updated_by)
  values (v_src.app_id, v_src.title, auth.uid(), auth.uid())
  returning * into v_new;

  insert into podio.item_field_values
    (item_id, field_id, position, value, value_text, value_number,
     value_date, value_date_end, ref_item_id, ref_user_id)
  select v_new.id, field_id, position, value, value_text, value_number,
         value_date, value_date_end, ref_item_id, ref_user_id
  from podio.item_field_values
  where item_id = v_src.id;

  insert into podio.item_relationships (field_id, from_item_id, to_item_id, created_by)
  select field_id, v_new.id, to_item_id, auth.uid()
  from podio.item_relationships
  where from_item_id = v_src.id
  on conflict do nothing;

  perform podio.compute_calculations(v_new.id);

  select a.workspace_id, w.organization_id into v_ws, v_org
  from podio.apps a join podio.workspaces w on w.id = a.workspace_id
  where a.id = v_src.app_id;

  insert into podio.item_followers (item_id, user_id)
  values (v_new.id, auth.uid())
  on conflict do nothing;

  insert into podio.activity_events
    (organization_id, workspace_id, app_id, item_id, actor_id,
     event_type, target_type, target_id, payload)
  values
    (v_org, v_ws, v_src.app_id, v_new.id, auth.uid(),
     'item_created', 'item', v_new.id,
     jsonb_build_object('item_title', v_new.title, 'item_number', v_new.item_number,
                        'cloned_from', v_src.item_number));

  return v_new;
end $$;
grant execute on function podio.clone_item(uuid) to authenticated;

-- delete_item: soft-delete (queries already filter `not is_deleted`), stamped
-- and logged. Kept reversible on purpose — nothing is hard-deleted here.
create or replace function podio.delete_item(p_item uuid)
returns void
language plpgsql security definer set search_path = podio, public as $$
declare
  v_src podio.items; v_ws uuid; v_org uuid;
begin
  select * into v_src from podio.items where id = p_item and not is_deleted;
  if v_src.id is null then
    raise exception 'item not found';
  end if;
  if not podio.is_workspace_member(podio.app_workspace(v_src.app_id)) then
    raise exception 'not a workspace member';
  end if;

  update podio.items
    set is_deleted = true, deleted_at = now(), updated_by = auth.uid()
    where id = v_src.id;

  select a.workspace_id, w.organization_id into v_ws, v_org
  from podio.apps a join podio.workspaces w on w.id = a.workspace_id
  where a.id = v_src.app_id;

  insert into podio.activity_events
    (organization_id, workspace_id, app_id, item_id, actor_id,
     event_type, target_type, target_id, payload)
  values
    (v_org, v_ws, v_src.app_id, v_src.id, auth.uid(),
     'item_deleted', 'item', v_src.id,
     jsonb_build_object('item_title', v_src.title, 'item_number', v_src.item_number));
end $$;
grant execute on function podio.delete_item(uuid) to authenticated;

-- recalc_item: membership-checked wrapper around compute_calculations, so the
-- "Refresh Calculations" action can re-derive calc fields without a full save.
create or replace function podio.recalc_item(p_item uuid)
returns void
language plpgsql security definer set search_path = podio, public as $$
declare v_app uuid;
begin
  select app_id into v_app from podio.items where id = p_item and not is_deleted;
  if v_app is null then
    raise exception 'item not found';
  end if;
  if not podio.is_workspace_member(podio.app_workspace(v_app)) then
    raise exception 'not a workspace member';
  end if;
  perform podio.compute_calculations(p_item);
end $$;
grant execute on function podio.recalc_item(uuid) to authenticated;
