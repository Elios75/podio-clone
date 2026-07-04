-- Podio Clone: Migration 17 - Public REST API backend: value-writer helper + key-authenticated dispatcher

-- Shared value writer (PATCH semantics: only fields present in p_values are replaced)
create or replace function podio.write_values(p_app uuid, p_item uuid, p_values jsonb, p_actor uuid)
returns void
language plpgsql security definer set search_path = podio, public as $$
declare
  v_field record;
  v_val jsonb; v_text text; v_num numeric; v_ref_item uuid; v_title text;
  v_rev int;
begin
  delete from podio.item_field_values
  where item_id = p_item
    and field_id in (select (jsonb_object_keys(p_values))::uuid);

  for v_field in
    select * from podio.app_fields
    where app_id = p_app and status = 'active'
      and type not in ('separator','calculation')
      and p_values ? id::text
  loop
    v_val := p_values -> v_field.id::text;
    if v_val is null or v_val = 'null'::jsonb or v_val = '""'::jsonb then
      continue;
    end if;
    v_text := case
      when v_field.type in ('file','image') then v_val->>'name'
      when jsonb_typeof(v_val) = 'string' then v_val #>> '{}'
    end;
    v_num := case
      when v_field.type = 'money' then nullif(v_val->>'amount','')::numeric
      when jsonb_typeof(v_val) = 'number' then (v_val #>> '{}')::numeric
    end;
    v_ref_item := case
      when v_field.type = 'relationship' then nullif(v_val #>> '{}','')::uuid
    end;

    insert into podio.item_field_values
      (item_id, field_id, value, value_text, value_number, value_date, value_date_end, ref_item_id, ref_user_id)
    values
      (p_item, v_field.id, v_val, v_text, v_num,
       case when v_field.type = 'date' then nullif(v_val->>'start','')::timestamptz end,
       case when v_field.type = 'date' then nullif(v_val->>'end','')::timestamptz end,
       v_ref_item,
       case when v_field.type = 'contact' then nullif(v_val #>> '{}','')::uuid end);

    if v_field.type = 'relationship' and v_ref_item is not null then
      insert into podio.item_relationships (field_id, from_item_id, to_item_id, created_by)
      values (v_field.id, p_item, v_ref_item, p_actor)
      on conflict do nothing;
    end if;

    if v_field.is_primary and v_text is not null then
      v_title := v_text;
    end if;
  end loop;

  if v_title is not null then
    update podio.items set title = v_title where id = p_item;
  end if;

  select coalesce(max(revision), 0) + 1 into v_rev
  from podio.item_revisions where item_id = p_item;
  insert into podio.item_revisions (item_id, revision, user_id, changes)
  values (p_item, v_rev, p_actor, p_values);
end $$;

-- API dispatcher: one function, one anon grant, key-hash authentication
create or replace function podio.api_request(p_key_hash text, p_action text, p_params jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_key podio.api_keys;
  v_org uuid;
  v_app podio.apps;
  v_item podio.items;
  v_values jsonb;
  v_limit int := least(coalesce((p_params->>'limit')::int, 50), 200);
  v_offset int := coalesce((p_params->>'offset')::int, 0);
  v_result jsonb;
begin
  select * into v_key from podio.api_keys
  where key_hash = p_key_hash and revoked_at is null;
  if v_key.id is null then
    raise exception 'invalid api key';
  end if;
  update podio.api_keys set last_used_at = now() where id = v_key.id;
  v_org := v_key.organization_id;

  if p_action in ('create_item','update_item','delete_item')
     and not ('write' = any(v_key.scopes)) then
    raise exception 'api key lacks write scope';
  end if;

  if p_action = 'list_apps' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'slug', a.slug, 'item_name', a.item_name,
      'workspace', w.name,
      'fields', (select coalesce(jsonb_agg(jsonb_build_object(
          'external_id', f.external_id, 'label', f.label, 'type', f.type)
          order by f.position), '[]'::jsonb)
        from podio.app_fields f where f.app_id = a.id and f.status = 'active')
    )), '[]'::jsonb) into v_result
    from podio.apps a
    join podio.workspaces w on w.id = a.workspace_id
    where w.organization_id = v_org and not a.is_archived;
    return jsonb_build_object('data', v_result);

  elsif p_action = 'list_items' then
    select a.* into v_app from podio.apps a
    join podio.workspaces w on w.id = a.workspace_id
    where a.id = (p_params->>'app_id')::uuid and w.organization_id = v_org;
    if v_app.id is null then raise exception 'app not found'; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'item_number', i.item_number, 'title', i.title,
      'created_at', i.created_at, 'updated_at', i.updated_at,
      'values', (select coalesce(jsonb_object_agg(af.external_id, ifv.value), '{}'::jsonb)
        from podio.item_field_values ifv
        join podio.app_fields af on af.id = ifv.field_id
        where ifv.item_id = i.id)
    )), '[]'::jsonb) into v_result
    from (select * from podio.items
          where app_id = v_app.id and not is_deleted
          order by created_at desc limit v_limit offset v_offset) i;
    return jsonb_build_object('data', v_result, 'limit', v_limit, 'offset', v_offset);

  elsif p_action in ('get_item','update_item','delete_item') then
    select i.* into v_item from podio.items i
    join podio.apps a on a.id = i.app_id
    join podio.workspaces w on w.id = a.workspace_id
    where i.id = (p_params->>'item_id')::uuid
      and w.organization_id = v_org and not i.is_deleted;
    if v_item.id is null then raise exception 'item not found'; end if;

    if p_action = 'delete_item' then
      update podio.items set is_deleted = true, deleted_at = now() where id = v_item.id;
      return jsonb_build_object('data', jsonb_build_object('deleted', true, 'id', v_item.id));
    end if;

    if p_action = 'update_item' then
      select coalesce(jsonb_object_agg(af.id::text, p_params->'values'->af.external_id), '{}'::jsonb)
        into v_values
      from podio.app_fields af
      where af.app_id = v_item.app_id and af.status = 'active'
        and p_params->'values' ? af.external_id;
      perform podio.write_values(v_item.app_id, v_item.id, v_values, null);
      update podio.items set updated_at = now() where id = v_item.id;
    end if;

    select jsonb_build_object(
      'id', i.id, 'item_number', i.item_number, 'title', i.title,
      'created_at', i.created_at, 'updated_at', i.updated_at,
      'values', (select coalesce(jsonb_object_agg(af.external_id, ifv.value), '{}'::jsonb)
        from podio.item_field_values ifv
        join podio.app_fields af on af.id = ifv.field_id
        where ifv.item_id = i.id)
    ) into v_result
    from podio.items i where i.id = v_item.id;
    return jsonb_build_object('data', v_result);

  elsif p_action = 'create_item' then
    select a.* into v_app from podio.apps a
    join podio.workspaces w on w.id = a.workspace_id
    where a.id = (p_params->>'app_id')::uuid and w.organization_id = v_org;
    if v_app.id is null then raise exception 'app not found'; end if;

    insert into podio.items (app_id) values (v_app.id) returning * into v_item;

    select coalesce(jsonb_object_agg(af.id::text, p_params->'values'->af.external_id), '{}'::jsonb)
      into v_values
    from podio.app_fields af
    where af.app_id = v_app.id and af.status = 'active'
      and p_params->'values' ? af.external_id;
    perform podio.write_values(v_app.id, v_item.id, v_values, null);

    insert into podio.activity_events
      (organization_id, workspace_id, app_id, item_id, event_type, target_type, target_id, payload)
    values
      (v_org, v_app.workspace_id, v_app.id, v_item.id, 'item_created', 'item', v_item.id,
       jsonb_build_object('via', 'api', 'api_key', v_key.name));

    perform podio.run_simple_automations(v_app.id, v_item.id, 'item_created', null);

    select jsonb_build_object(
      'id', i.id, 'item_number', i.item_number, 'title', i.title, 'created_at', i.created_at,
      'values', (select coalesce(jsonb_object_agg(af.external_id, ifv.value), '{}'::jsonb)
        from podio.item_field_values ifv
        join podio.app_fields af on af.id = ifv.field_id
        where ifv.item_id = i.id)
    ) into v_result
    from podio.items i where i.id = v_item.id;
    return jsonb_build_object('data', v_result);

  else
    raise exception 'unknown action: %', p_action;
  end if;
end $$;
grant execute on function podio.api_request(text, text, jsonb) to anon, authenticated;
