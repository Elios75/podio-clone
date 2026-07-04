-- Podio Clone: Migration 24 - Live app schema editing
-- update_app_schema: diff-apply a full field list (update / insert / soft-delete),
-- bump schema_version, snapshot to app_schema_revisions.

-- Value counts per field, for "this field has data" warnings
create or replace function podio.field_value_counts(p_app uuid)
returns table(field_id uuid, cnt bigint)
language sql stable security definer set search_path = podio, public as $$
  select af.id, count(ifv.id)
  from podio.app_fields af
  left join podio.item_field_values ifv on ifv.field_id = af.id
  where af.app_id = p_app and af.status = 'active'
    and podio.is_workspace_member(podio.app_workspace(p_app))
  group by af.id;
$$;
grant execute on function podio.field_value_counts(uuid) to authenticated;

create or replace function podio.update_app_schema(p_app uuid, p_fields jsonb)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_app podio.apps;
  v_f jsonb;
  v_idx int := 0;
  v_seen uuid[] := '{}';
  v_id uuid;
  v_primary_set boolean := false;
  v_deleted int;
begin
  select * into v_app from podio.apps where id = p_app;
  if v_app.id is null or not podio.can_edit_items(v_app.workspace_id) then
    raise exception 'insufficient role to edit app schema';
  end if;
  if jsonb_array_length(p_fields) = 0 then
    raise exception 'an app needs at least one field';
  end if;
  if jsonb_array_length(p_fields) > 200 then
    raise exception 'maximum 200 fields per app';
  end if;

  for v_f in select * from jsonb_array_elements(p_fields) loop
    if nullif(v_f->>'id','') is not null then
      v_id := (v_f->>'id')::uuid;
      update podio.app_fields set
        label = v_f->>'label',
        type = (v_f->>'type')::podio.field_type,
        help_text = nullif(v_f->>'help_text',''),
        is_required = coalesce((v_f->>'is_required')::boolean, false),
        is_hidden = coalesce((v_f->>'is_hidden')::boolean, false),
        is_primary = coalesce((v_f->>'is_primary')::boolean, false),
        position = v_idx,
        config = coalesce(v_f->'config', '{}'::jsonb),
        status = 'active'
      where id = v_id and app_id = p_app;
      if not found then
        raise exception 'field % not found in app', v_id;
      end if;
    else
      insert into podio.app_fields
        (app_id, external_id, label, type, help_text, is_required, is_hidden,
         is_primary, position, config)
      values
        (p_app,
         lower(regexp_replace(coalesce(v_f->>'label','field'), '[^a-zA-Z0-9]+', '-', 'g'))
           || '-' || v_idx || '-' || substr(md5(random()::text), 1, 4),
         v_f->>'label',
         (v_f->>'type')::podio.field_type,
         nullif(v_f->>'help_text',''),
         coalesce((v_f->>'is_required')::boolean, false),
         coalesce((v_f->>'is_hidden')::boolean, false),
         coalesce((v_f->>'is_primary')::boolean, false),
         v_idx,
         coalesce(v_f->'config', '{}'::jsonb))
      returning id into v_id;
    end if;
    v_seen := v_seen || v_id;
    if coalesce((v_f->>'is_primary')::boolean, false) then
      v_primary_set := true;
    end if;
    v_idx := v_idx + 1;
  end loop;

  update podio.app_fields
  set status = 'deleted', is_primary = false
  where app_id = p_app and status = 'active' and not (id = any(v_seen));
  get diagnostics v_deleted = row_count;

  if not v_primary_set then
    update podio.app_fields set is_primary = true
    where id = (select id from podio.app_fields
      where app_id = p_app and status = 'active' and type = 'text'
      order by position limit 1);
  end if;

  update podio.apps set schema_version = schema_version + 1 where id = p_app
  returning * into v_app;

  insert into podio.app_schema_revisions (app_id, version, snapshot, changed_by)
  values (p_app, v_app.schema_version,
    (select coalesce(jsonb_agg(jsonb_build_object(
       'external_id', f.external_id, 'label', f.label, 'type', f.type,
       'is_required', f.is_required, 'is_primary', f.is_primary,
       'position', f.position, 'config', f.config) order by f.position), '[]'::jsonb)
     from podio.app_fields f where f.app_id = p_app and f.status = 'active'),
    auth.uid());

  return jsonb_build_object(
    'version', v_app.schema_version,
    'active_fields', array_length(v_seen, 1),
    'removed_fields', v_deleted);
end $$;
grant execute on function podio.update_app_schema(uuid, jsonb) to authenticated;
