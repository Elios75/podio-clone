-- Podio Clone: Migration 50 - Beyond-Podio "table" field type
--
-- A table field is an embedded one-to-many sub-table inside a record (e.g. a
-- Customer holding invoice lines: Date, Product, Amount). No new tables are
-- needed — the rows live inside the existing item_field_values.value jsonb:
--
--   app_fields.config        : { "columns": [ { "id": uuid, "label": text,
--                                 "type": "text"|"number"|"money"|"date"|
--                                         "checkbox"|"category",
--                                 "options"?: [{id,label,color}] } ],
--                                 "currency"?: "USD" }
--   item_field_values.value  : { "rows": [ { "<columnId>":
--                                 string|number|boolean|null, ... } ] }
--                               (dates as ISO "YYYY-MM-DD" strings; money
--                               cells as plain numbers — currency lives once
--                               on the field config)
--
-- The only schema change is the enum value. NOTE: the new enum value is
-- usable only after this transaction commits (safe: nothing below uses it).
alter type podio.field_type add value if not exists 'table';

-- save_item v5 = v4 + a value_text mirror for table fields. The value jsonb
-- passes through untouched (it always did — jsonb_typeof(v_val) = 'object'
-- fell through every mirror case); this only adds a human summary ("3 rows")
-- to value_text so global search and generic value_text renderers degrade
-- gracefully. Everything else is byte-identical to v4 (migration 14).
create or replace function podio.save_item(p_app uuid, p_item uuid, p_values jsonb)
returns podio.items
language plpgsql security definer set search_path = podio, public as $$
declare
  v_item podio.items;
  v_field record;
  v_val jsonb;
  v_text text;
  v_num numeric;
  v_ref_item uuid;
  v_title text;
  v_rev int;
  v_ws uuid; v_org uuid;
  v_is_new boolean := (p_item is null);
  v_rowcount int;
begin
  if not podio.is_workspace_member(podio.app_workspace(p_app)) then
    raise exception 'not a workspace member';
  end if;

  select a.workspace_id, w.organization_id into v_ws, v_org
  from podio.apps a join podio.workspaces w on w.id = a.workspace_id
  where a.id = p_app;

  if v_is_new then
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

  delete from podio.item_field_values where item_id = v_item.id;
  delete from podio.item_relationships where from_item_id = v_item.id;

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

    if v_field.type::text = 'table' then
      -- Human summary mirror: "1 row" / "3 rows".
      v_rowcount := coalesce(jsonb_array_length(
        case when jsonb_typeof(v_val->'rows') = 'array'
             then v_val->'rows' else '[]'::jsonb end), 0);
      v_text := v_rowcount || case when v_rowcount = 1 then ' row' else ' rows' end;
    else
      v_text := case
        when v_field.type in ('file','image') then v_val->>'name'
        when jsonb_typeof(v_val) = 'string' then v_val #>> '{}'
        else null
      end;
    end if;
    v_num := case
      when v_field.type = 'money' then nullif(v_val->>'amount','')::numeric
      when jsonb_typeof(v_val) = 'number' then (v_val #>> '{}')::numeric
      else null
    end;
    v_ref_item := case
      when v_field.type = 'relationship' then nullif(v_val #>> '{}','')::uuid
      else null
    end;

    insert into podio.item_field_values (
      item_id, field_id, value, value_text, value_number,
      value_date, value_date_end, ref_item_id, ref_user_id
    ) values (
      v_item.id, v_field.id, v_val, v_text, v_num,
      case when v_field.type = 'date' then nullif(v_val->>'start','')::timestamptz end,
      case when v_field.type = 'date' then nullif(v_val->>'end','')::timestamptz end,
      v_ref_item,
      case when v_field.type = 'contact' then nullif(v_val #>> '{}','')::uuid end
    );

    if v_field.type = 'relationship' and v_ref_item is not null then
      insert into podio.item_relationships (field_id, from_item_id, to_item_id, created_by)
      values (v_field.id, v_item.id, v_ref_item, auth.uid())
      on conflict do nothing;
    end if;

    if v_field.is_primary then
      v_title := v_text;
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

  if v_is_new then
    insert into podio.item_followers (item_id, user_id)
    values (v_item.id, auth.uid())
    on conflict do nothing;
  end if;

  insert into podio.activity_events
    (organization_id, workspace_id, app_id, item_id, actor_id, event_type, target_type, target_id, payload)
  values
    (v_org, v_ws, p_app, v_item.id, auth.uid(),
     case when v_is_new then 'item_created' else 'item_updated' end,
     'item', v_item.id,
     jsonb_build_object('item_title', v_item.title, 'item_number', v_item.item_number));

  perform podio.run_simple_automations(
    p_app, v_item.id,
    case when v_is_new then 'item_created' else 'item_updated' end,
    auth.uid());

  return v_item;
end $$;
