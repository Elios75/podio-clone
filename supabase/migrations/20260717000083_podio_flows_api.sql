-- Podio Clone: Migration 83 - Flows + Subscriptions + Notifications public API
-- SECURITY DEFINER dispatcher podio.flows_api mirroring the api_request pattern
-- (key-hash auth, per-key rate limiting, write-scope enforcement) and operating
-- on podio.automations / podio.follows / podio.notifications.
--
-- Notes:
-- * Flow versioning is handled by the existing BEFORE UPDATE trigger
--   trg_automations_revision (migration 37): any change to name/trigger/
--   conditions/actions/definition snapshots the old version into
--   automation_revisions and bumps automations.version. flow.update relies on
--   that trigger (same path the UI uses); no manual snapshot is needed.
-- * API keys are org-scoped; api_keys.created_by is treated as the acting user
--   for subscription.* and notification.* actions. Keys without an owning user
--   get a clear error for those actions.

create or replace function podio.flows_api(
  p_key_hash text, p_action text, p_params jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_key podio.api_keys;
  v_org uuid;
  v_user uuid;
  v_app podio.apps;
  v_auto podio.automations;
  v_ws uuid;
  v_trigger jsonb;
  v_conditions jsonb;
  v_actions jsonb;
  v_a jsonb;
  v_limit int := least(coalesce((p_params->>'limit')::int, 50), 200);
  v_offset int := coalesce((p_params->>'offset')::int, 0);
  v_result jsonb;
  v_cnt int;
  v_follow podio.follows;
  c_trigger_types constant text[] :=
    array['item_created','item_updated','item_deleted','date_reached',
          'comment_added','task_completed','manual'];
  -- every action type podio.exec_action (migrations 35 + 37) executes
  c_action_types constant text[] :=
    array['create_task','update_field','notify','add_comment','send_email',
          'http_request','update_related_item','generate_pdf'];
  -- attributes each action type reads in podio.exec_action
  c_effect_attrs constant jsonb := jsonb_build_object(
    'create_task',         jsonb_build_array('title','assignee_id','due_days'),
    'update_field',        jsonb_build_array('field_id','value'),
    'notify',              jsonb_build_array('user_id','message'),
    'add_comment',         jsonb_build_array('body'),
    'send_email',          jsonb_build_array('to','subject','body'),
    'http_request',        jsonb_build_array('url','method','headers','body'),
    'update_related_item', jsonb_build_array('field_id','value','relationship_field_id'),
    'generate_pdf',        jsonb_build_array('note')
  );
begin
  -- ---- key / rate / scope validation (same pattern as api_request) ----
  select * into v_key from podio.api_keys
  where key_hash = p_key_hash and revoked_at is null;
  if v_key.id is null then
    raise exception 'invalid api key';
  end if;
  perform podio.check_rate_limit(v_key);
  update podio.api_keys set last_used_at = now() where id = v_key.id;
  v_org := v_key.organization_id;
  v_user := v_key.created_by;

  if p_action in ('flow.create','flow.update','flow.delete','flow.activate','flow.deactivate',
                  'subscription.create','subscription.delete','notification.mark_read')
     and not ('write' = any(v_key.scopes)) then
    raise exception 'api key lacks write scope';
  end if;

  if p_action like 'subscription.%' or p_action like 'notification.%' then
    if v_user is null then
      raise exception 'api key has no owning user; subscription/notification actions unavailable';
    end if;
  end if;

  -- ---------------------------------------------------------------
  -- FLOWS
  -- ---------------------------------------------------------------
  if p_action = 'flow.list' then
    select a.* into v_app from podio.apps a
    join podio.workspaces w on w.id = a.workspace_id
    where a.id = (p_params->>'app_id')::uuid and w.organization_id = v_org;
    if v_app.id is null then raise exception 'app not found'; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', au.id, 'name', au.name, 'kind', au.kind, 'status', au.status,
      'trigger', au.trigger, 'conditions', au.conditions, 'actions', au.actions,
      'version', au.version, 'updated_at', au.updated_at
    ) order by au.updated_at desc), '[]'::jsonb) into v_result
    from podio.automations au where au.app_id = v_app.id;
    return jsonb_build_object('data', v_result);

  elsif p_action in ('flow.get','flow.update','flow.delete','flow.activate','flow.deactivate',
                     'flow.effect_attributes') then
    select au.* into v_auto from podio.automations au
    join podio.workspaces w on w.id = au.workspace_id
    where au.id = (p_params->>'flow_id')::uuid and w.organization_id = v_org;
    if v_auto.id is null then raise exception 'flow not found'; end if;

    if p_action = 'flow.delete' then
      delete from podio.automations where id = v_auto.id;
      return jsonb_build_object('data', jsonb_build_object('deleted', true, 'id', v_auto.id));

    elsif p_action in ('flow.activate','flow.deactivate') then
      update podio.automations
      set status = case when p_action = 'flow.activate'
                        then 'active'::podio.automation_status
                        else 'paused'::podio.automation_status end,
          updated_by = v_user
      where id = v_auto.id
      returning * into v_auto;

    elsif p_action = 'flow.update' then
      v_trigger := p_params->'trigger';
      v_actions := p_params->'actions';
      if v_trigger is not null and jsonb_typeof(v_trigger) = 'object' then
        if not (v_trigger->>'type' = any(c_trigger_types)) then
          raise exception 'invalid trigger type: %', coalesce(v_trigger->>'type','(none)');
        end if;
      end if;
      if v_actions is not null and jsonb_typeof(v_actions) = 'array' then
        for v_a in select * from jsonb_array_elements(v_actions) loop
          if not (v_a->>'type' = any(c_action_types)) then
            raise exception 'invalid action type: %', coalesce(v_a->>'type','(none)');
          end if;
        end loop;
      end if;
      -- trg_automations_revision snapshots the previous version automatically
      update podio.automations
      set name = coalesce(nullif(p_params->>'name',''), name),
          trigger = case when v_trigger is not null
                          and jsonb_typeof(v_trigger) = 'object'
                         then v_trigger else trigger end,
          conditions = case when p_params ? 'conditions'
                             and jsonb_typeof(p_params->'conditions') = 'array'
                            then p_params->'conditions' else conditions end,
          actions = case when v_actions is not null
                          and jsonb_typeof(v_actions) = 'array'
                         then v_actions else actions end,
          updated_by = v_user
      where id = v_auto.id
      returning * into v_auto;

    elsif p_action = 'flow.effect_attributes' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'type', a->>'type',
        'attributes', coalesce(c_effect_attrs->(a->>'type'), '[]'::jsonb)
      )), '[]'::jsonb) into v_result
      from jsonb_array_elements(v_auto.actions) a;
      return jsonb_build_object('data', jsonb_build_object(
        'flow_id', v_auto.id, 'actions', v_result));
    end if;

    -- flow.get + post-mutation reads fall through to a single serializer
    return jsonb_build_object('data', jsonb_build_object(
      'id', v_auto.id, 'app_id', v_auto.app_id, 'name', v_auto.name,
      'kind', v_auto.kind, 'status', v_auto.status, 'trigger', v_auto.trigger,
      'conditions', v_auto.conditions, 'actions', v_auto.actions,
      'version', v_auto.version, 'updated_at', v_auto.updated_at));

  elsif p_action = 'flow.create' then
    select a.* into v_app from podio.apps a
    join podio.workspaces w on w.id = a.workspace_id
    where a.id = (p_params->>'app_id')::uuid and w.organization_id = v_org;
    if v_app.id is null then raise exception 'app not found'; end if;
    v_ws := v_app.workspace_id;

    if nullif(p_params->>'name','') is null then
      raise exception 'name is required';
    end if;
    v_trigger := p_params->'trigger';
    if v_trigger is null or jsonb_typeof(v_trigger) <> 'object'
       or not (v_trigger->>'type' = any(c_trigger_types)) then
      raise exception 'invalid trigger type: %', coalesce(v_trigger->>'type','(none)');
    end if;
    v_conditions := coalesce(p_params->'conditions', '[]'::jsonb);
    if jsonb_typeof(v_conditions) <> 'array' then
      raise exception 'conditions must be an array';
    end if;
    v_actions := coalesce(p_params->'actions', '[]'::jsonb);
    if jsonb_typeof(v_actions) <> 'array' then
      raise exception 'actions must be an array';
    end if;
    for v_a in select * from jsonb_array_elements(v_actions) loop
      if not (v_a->>'type' = any(c_action_types)) then
        raise exception 'invalid action type: %', coalesce(v_a->>'type','(none)');
      end if;
    end loop;

    insert into podio.automations
      (workspace_id, app_id, name, kind, status, trigger, conditions, actions, created_by, updated_by)
    values
      (v_ws, v_app.id, p_params->>'name', 'simple', 'draft',
       v_trigger, v_conditions, v_actions, v_user, v_user)
    returning * into v_auto;

    return jsonb_build_object('data', jsonb_build_object(
      'id', v_auto.id, 'app_id', v_auto.app_id, 'name', v_auto.name,
      'kind', v_auto.kind, 'status', v_auto.status, 'trigger', v_auto.trigger,
      'conditions', v_auto.conditions, 'actions', v_auto.actions,
      'version', v_auto.version, 'updated_at', v_auto.updated_at));

  elsif p_action = 'flow.possible_attributes' then
    select a.* into v_app from podio.apps a
    join podio.workspaces w on w.id = a.workspace_id
    where a.id = (p_params->>'app_id')::uuid and w.organization_id = v_org;
    if v_app.id is null then raise exception 'app not found'; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'external_id', f.external_id, 'label', f.label, 'type', f.type,
      'options', case when f.type = 'category' then f.config->'options' end
    ) order by f.position), '[]'::jsonb) into v_result
    from podio.app_fields f
    where f.app_id = v_app.id and f.status = 'active'
      and f.type not in ('separator','calculation');
    return jsonb_build_object('data', jsonb_build_object(
      'app_id', v_app.id, 'fields', v_result,
      'trigger_types', to_jsonb(c_trigger_types),
      'action_types', to_jsonb(c_action_types)));

  -- ---------------------------------------------------------------
  -- SUBSCRIPTIONS (podio.follows, scoped to the key's owning user)
  -- ---------------------------------------------------------------
  elsif p_action = 'subscription.list' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'target_type', f.target_type, 'target_id', f.target_id,
      'muted', f.muted, 'created_at', f.created_at
    ) order by f.created_at desc), '[]'::jsonb) into v_result
    from (select * from podio.follows where user_id = v_user
          order by created_at desc limit v_limit offset v_offset) f;
    return jsonb_build_object('data', v_result, 'limit', v_limit, 'offset', v_offset);

  elsif p_action = 'subscription.get' then
    select * into v_follow from podio.follows
    where user_id = v_user
      and target_type = (p_params->>'target_type')::podio.object_type
      and target_id = (p_params->>'target_id')::uuid;
    return jsonb_build_object('data', jsonb_build_object(
      'target_type', p_params->>'target_type', 'target_id', p_params->>'target_id',
      'subscribed', v_follow.id is not null,
      'muted', coalesce(v_follow.muted, false)));

  elsif p_action = 'subscription.create' then
    insert into podio.follows (user_id, target_type, target_id)
    values (v_user, (p_params->>'target_type')::podio.object_type,
            (p_params->>'target_id')::uuid)
    on conflict (user_id, target_type, target_id) do update set muted = podio.follows.muted
    returning * into v_follow;
    return jsonb_build_object('data', jsonb_build_object(
      'id', v_follow.id, 'target_type', v_follow.target_type,
      'target_id', v_follow.target_id, 'muted', v_follow.muted,
      'subscribed', true));

  elsif p_action = 'subscription.delete' then
    delete from podio.follows
    where user_id = v_user
      and target_type = (p_params->>'target_type')::podio.object_type
      and target_id = (p_params->>'target_id')::uuid;
    get diagnostics v_cnt = row_count;
    return jsonb_build_object('data', jsonb_build_object(
      'deleted', v_cnt > 0,
      'target_type', p_params->>'target_type', 'target_id', p_params->>'target_id'));

  -- ---------------------------------------------------------------
  -- NOTIFICATIONS (scoped to the key's owning user)
  -- ---------------------------------------------------------------
  elsif p_action = 'notification.list' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id, 'event_type', n.event_type, 'target_type', n.target_type,
      'target_id', n.target_id, 'actor_id', n.actor_id, 'payload', n.payload,
      'read_at', n.read_at, 'created_at', n.created_at
    ) order by n.created_at desc), '[]'::jsonb) into v_result
    from (select * from podio.notifications
          where user_id = v_user
            and (not coalesce((p_params->>'unread_only')::boolean, false) or read_at is null)
          order by created_at desc limit v_limit offset v_offset) n;
    return jsonb_build_object('data', v_result, 'limit', v_limit, 'offset', v_offset);

  elsif p_action = 'notification.mark_read' then
    if coalesce((p_params->>'all')::boolean, false) then
      update podio.notifications set read_at = now()
      where user_id = v_user and read_at is null;
    elsif nullif(p_params->>'id','') is not null then
      update podio.notifications set read_at = now()
      where user_id = v_user and id = (p_params->>'id')::uuid and read_at is null;
    else
      raise exception 'provide id or all=true';
    end if;
    get diagnostics v_cnt = row_count;
    return jsonb_build_object('data', jsonb_build_object('marked_read', v_cnt));

  else
    raise exception 'unknown action: %', p_action;
  end if;
end $$;

grant execute on function podio.flows_api(text, text, jsonb) to anon, authenticated;
