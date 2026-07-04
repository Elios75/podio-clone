-- Podio Clone: Migration 10 - Atomic item save: item + typed field values + revision in one call
create or replace function podio.save_item(p_app uuid, p_item uuid, p_values jsonb)
returns podio.items
language plpgsql security definer set search_path = podio, public as $$
declare
  v_item podio.items;
  v_field record;
  v_val jsonb;
  v_title text;
  v_rev int;
begin
  if not podio.is_workspace_member(podio.app_workspace(p_app)) then
    raise exception 'not a workspace member';
  end if;

  if p_item is null then
    insert into podio.items (app_id, created_by, updated_by)
    values (p_app, auth.uid(), auth.uid())
    returning * into v_item;
  else
    select * into v_item from podio.items where id = p_item and app_id = p_app;
    if v_item.id is null then
      raise exception 'item not found';
    end if;
    update podio.items set updated_by = auth.uid() where id = v_item.id;
  end if;

  -- Replace all values (simple + correct; optimize to diffs later)
  delete from podio.item_field_values where item_id = v_item.id;

  for v_field in
    select * from podio.app_fields
    where app_id = p_app and status = 'active' and p_values ? id::text
  loop
    v_val := p_values -> v_field.id::text;
    if v_val is null or v_val = 'null'::jsonb or v_val = '""'::jsonb then
      continue;
    end if;

    insert into podio.item_field_values (
      item_id, field_id, value, value_text, value_number,
      value_date, value_date_end, ref_item_id, ref_user_id
    ) values (
      v_item.id, v_field.id, v_val,
      case when jsonb_typeof(v_val) = 'string' then v_val #>> '{}' end,
      case when jsonb_typeof(v_val) = 'number' then (v_val #>> '{}')::numeric end,
      case when v_field.type = 'date' then nullif(v_val->>'start','')::timestamptz end,
      case when v_field.type = 'date' then nullif(v_val->>'end','')::timestamptz end,
      case when v_field.type = 'relationship' then nullif(v_val #>> '{}','')::uuid end,
      case when v_field.type = 'contact' then nullif(v_val #>> '{}','')::uuid end
    );

    if v_field.is_primary then
      v_title := v_val #>> '{}';
    end if;
  end loop;

  if v_title is not null then
    update podio.items set title = v_title where id = v_item.id returning * into v_item;
  else
    select * into v_item from podio.items where id = v_item.id;
  end if;

  select coalesce(max(revision), 0) + 1 into v_rev
  from podio.item_revisions where item_id = v_item.id;
  insert into podio.item_revisions (item_id, revision, user_id, changes)
  values (v_item.id, v_rev, auth.uid(), p_values);

  return v_item;
end $$;

grant execute on function podio.save_item(uuid, uuid, jsonb) to authenticated;
