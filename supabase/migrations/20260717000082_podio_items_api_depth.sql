-- Podio Clone: Migration 82 - Items API depth: revisions, diff, revert, clone,
-- single-field value update, bulk delete — behind a dedicated key-authenticated
-- dispatcher `items_api` (api_request is left untouched).
--
-- Revision storage recap (see migration 2 + 10 + 17): item_revisions stores
-- (item_id, revision, user_id, changes jsonb, created_at). `changes` is the
-- field_id-keyed jsonb map handed to the writer for THAT save: save_item gets
-- the full values map, write_values (public API PATCH) only the touched fields.
-- A single revision row is therefore NOT a guaranteed-complete snapshot, so
-- both diff and revert reconstruct the cumulative state at revision N by
-- merging `changes` maps in revision order (later writes win per field).

-- Cumulative values state at a given revision: {} || changes(rev 1) || ... || changes(rev N).
-- Invoker rights on purpose: only reachable in practice through items_api
-- (security definer); a direct anon call fails on table privileges.
create or replace function podio.revision_state(p_item uuid, p_rev int)
returns jsonb
language plpgsql stable set search_path = podio, public as $$
declare
  v_state jsonb := '{}'::jsonb;
  r record;
begin
  for r in
    select changes from podio.item_revisions
    where item_id = p_item and revision <= p_rev
    order by revision
  loop
    v_state := v_state || coalesce(r.changes, '{}'::jsonb);
  end loop;
  return v_state;
end $$;

-- Dedicated dispatcher for item-depth actions. Replicates api_request's
-- authentication inline (key hash + revocation, per-minute rate limit,
-- last_used_at stamp, org scoping, write-scope gate) and then dispatches.
create or replace function podio.items_api(p_key_hash text, p_action text, p_params jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_key podio.api_keys;
  v_org uuid;
  v_app podio.apps;
  v_item podio.items;
  v_new podio.items;
  v_field podio.app_fields;
  v_from int; v_to int; v_rev int; v_new_rev int;
  v_state_from jsonb; v_state_to jsonb;
  v_state jsonb; v_restore jsonb;
  v_ids uuid[];
  v_ws uuid;
  v_count int;
  v_result jsonb;
begin
  -- authentication (mirrors api_request v1.1)
  select * into v_key from podio.api_keys
  where key_hash = p_key_hash and revoked_at is null;
  if v_key.id is null then
    raise exception 'invalid api key';
  end if;
  perform podio.check_rate_limit(v_key);
  update podio.api_keys set last_used_at = now() where id = v_key.id;
  v_org := v_key.organization_id;

  if p_action in ('item.revert','item.clone','item.value.update','items.bulk_delete')
     and not ('write' = any(v_key.scopes)) then
    raise exception 'api key lacks write scope';
  end if;

  -- item.* actions: resolve the item and pin it to the key's organization
  if p_action like 'item.%' then
    select i.* into v_item from podio.items i
    join podio.apps a on a.id = i.app_id
    join podio.workspaces w on w.id = a.workspace_id
    where i.id = (p_params->>'item_id')::uuid
      and w.organization_id = v_org and not i.is_deleted;
    if v_item.id is null then raise exception 'item not found'; end if;
  end if;

  if p_action = 'item.revisions' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'revision', r.revision,
      'created_at', r.created_at,
      'created_by', r.user_id
    ) order by r.revision desc), '[]'::jsonb) into v_result
    from podio.item_revisions r
    where r.item_id = v_item.id;
    return jsonb_build_object('data', v_result);

  elsif p_action = 'item.revision.diff' then
    v_from := (p_params->>'from_rev')::int;
    v_to := (p_params->>'to_rev')::int;
    if v_from is null or v_to is null then
      raise exception 'from_rev and to_rev are required';
    end if;
    v_state_from := podio.revision_state(v_item.id, v_from);
    v_state_to := podio.revision_state(v_item.id, v_to);

    select coalesce(jsonb_agg(jsonb_build_object(
      'field_id', af.id,
      'external_id', af.external_id,
      'label', af.label,
      'type', af.type,
      'old', v_state_from -> k.key,
      'new', v_state_to -> k.key
    ) order by af.position), '[]'::jsonb) into v_result
    from (
      select jsonb_object_keys(v_state_from) as key
      union
      select jsonb_object_keys(v_state_to)
    ) k
    join podio.app_fields af on af.id::text = k.key and af.app_id = v_item.app_id
    where (v_state_from -> k.key) is distinct from (v_state_to -> k.key);

    return jsonb_build_object('data', jsonb_build_object(
      'from_rev', v_from, 'to_rev', v_to, 'changes', v_result));

  elsif p_action = 'item.revert' then
    v_rev := (p_params->>'rev')::int;
    if v_rev is null then raise exception 'rev is required'; end if;
    if not exists (select 1 from podio.item_revisions
                   where item_id = v_item.id and revision = v_rev) then
      raise exception 'revision not found';
    end if;

    -- Reconstructed full state at that revision, limited to currently
    -- writable fields (calc/separator values are derived, not restored).
    v_state := jsonb_strip_nulls(podio.revision_state(v_item.id, v_rev));
    select coalesce(jsonb_object_agg(af.id::text, v_state -> af.id::text), '{}'::jsonb)
      into v_restore
    from podio.app_fields af
    where af.app_id = v_item.app_id and af.status = 'active'
      and af.type not in ('separator','calculation')
      and v_state ? af.id::text;

    -- save_item semantics: wipe all values, reinsert the snapshot.
    -- write_values also records the new revision row (the bump).
    delete from podio.item_field_values where item_id = v_item.id;
    perform podio.write_values(v_item.app_id, v_item.id, v_restore, v_key.created_by);
    perform podio.compute_calculations(v_item.id);
    update podio.items
      set updated_at = now(), updated_by = coalesce(v_key.created_by, updated_by)
      where id = v_item.id;

    select max(revision) into v_new_rev
    from podio.item_revisions where item_id = v_item.id;

    select a.workspace_id into v_ws from podio.apps a where a.id = v_item.app_id;
    insert into podio.activity_events
      (organization_id, workspace_id, app_id, item_id, actor_id,
       event_type, target_type, target_id, payload)
    values
      (v_org, v_ws, v_item.app_id, v_item.id, v_key.created_by,
       'item_reverted', 'item', v_item.id,
       jsonb_build_object('item_title', v_item.title, 'item_number', v_item.item_number,
                          'reverted_to', v_rev, 'new_revision', v_new_rev,
                          'via', 'api', 'api_key', v_key.name));

    return jsonb_build_object('data', jsonb_build_object(
      'id', v_item.id, 'reverted_to', v_rev, 'revision', v_new_rev));

  elsif p_action = 'item.clone' then
    -- Reuse clone_item (membership check, deep copy, recalc, follow, activity).
    -- It authorizes via auth.uid(), so impersonate the key's owning user for
    -- the rest of this transaction (set_config with is_local = true).
    if v_key.created_by is null then
      raise exception 'api key has no owning user; cannot clone';
    end if;
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', v_key.created_by, 'role', 'authenticated')::text, true);
    v_new := podio.clone_item(v_item.id);

    return jsonb_build_object('data', jsonb_build_object(
      'id', v_new.id, 'item_number', v_new.item_number, 'title', v_new.title,
      'created_at', v_new.created_at, 'cloned_from', v_item.id));

  elsif p_action = 'item.value.update' then
    -- SURGICAL single-field write. Never save_item here (it deletes ALL
    -- values); write_values with a one-key map deletes and reinserts only
    -- this field's rows, records the one-field revision, and maintains
    -- title/relationships. Calc fields are then re-derived.
    select * into v_field from podio.app_fields
    where id = (p_params->>'field_id')::uuid
      and app_id = v_item.app_id and status = 'active';
    if v_field.id is null then raise exception 'field not found'; end if;
    if v_field.type in ('separator','calculation') then
      raise exception 'cannot write to a % field', v_field.type;
    end if;

    perform podio.write_values(
      v_item.app_id, v_item.id,
      jsonb_build_object(v_field.id::text, p_params -> 'value'),
      v_key.created_by);
    perform podio.compute_calculations(v_item.id);
    update podio.items
      set updated_at = now(), updated_by = coalesce(v_key.created_by, updated_by)
      where id = v_item.id;

    select jsonb_build_object(
      'id', i.id, 'item_number', i.item_number, 'title', i.title,
      'updated_at', i.updated_at,
      'values', (select coalesce(jsonb_object_agg(af.external_id, ifv.value), '{}'::jsonb)
        from podio.item_field_values ifv
        join podio.app_fields af on af.id = ifv.field_id
        where ifv.item_id = i.id)
    ) into v_result
    from podio.items i where i.id = v_item.id;
    return jsonb_build_object('data', v_result);

  elsif p_action = 'items.bulk_delete' then
    select a.* into v_app from podio.apps a
    join podio.workspaces w on w.id = a.workspace_id
    where a.id = (p_params->>'app_id')::uuid and w.organization_id = v_org;
    if v_app.id is null then raise exception 'app not found'; end if;

    select array_agg(x::uuid) into v_ids
    from jsonb_array_elements_text(coalesce(p_params->'item_ids', '[]'::jsonb)) x;
    if v_ids is null or cardinality(v_ids) = 0 then
      raise exception 'item_ids is required';
    end if;
    if cardinality(v_ids) > 100 then
      raise exception 'too many items: max 100 per call';
    end if;

    -- Soft delete (mirrors delete_item), one item_deleted event per item.
    with upd as (
      update podio.items
        set is_deleted = true, deleted_at = now(),
            updated_by = coalesce(v_key.created_by, updated_by)
      where app_id = v_app.id and id = any(v_ids) and not is_deleted
      returning id, title, item_number
    ), ev as (
      insert into podio.activity_events
        (organization_id, workspace_id, app_id, item_id, actor_id,
         event_type, target_type, target_id, payload)
      select v_org, v_app.workspace_id, v_app.id, upd.id, v_key.created_by,
             'item_deleted', 'item', upd.id,
             jsonb_build_object('item_title', upd.title, 'item_number', upd.item_number,
                                'via', 'api', 'api_key', v_key.name)
      from upd
    )
    select count(*) into v_count from upd;

    return jsonb_build_object('data', jsonb_build_object('deleted_count', v_count));

  else
    raise exception 'unknown action: %', p_action;
  end if;
end $$;
grant execute on function podio.items_api(text, text, jsonb) to anon, authenticated;
