-- Podio Clone: Migration 14 - Public webforms (anon RPCs) + simple automation engine

grant usage on schema podio to anon;

-- Public: fetch an active form's definition by slug
create or replace function podio.get_webform(p_slug text)
returns jsonb
language sql stable security definer set search_path = podio, public as $$
  select jsonb_build_object(
    'title', f.title,
    'description', f.description,
    'success_message', coalesce(f.settings->>'success_message', 'Thank you! Your submission was received.'),
    'app_name', a.name,
    'icon', a.icon,
    'item_name', a.item_name,
    'fields', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', af.id, 'label', af.label, 'type', af.type,
        'is_required', af.is_required, 'help_text', af.help_text, 'config', af.config
      ) order by af.position), '[]'::jsonb)
      from podio.app_fields af
      where af.app_id = a.id and af.status = 'active'
        and af.id = any(f.field_ids)
        and af.type not in ('relationship','contact','image','file','calculation')
    )
  )
  from podio.webforms f
  join podio.apps a on a.id = f.app_id
  where f.slug = p_slug and f.is_active;
$$;
grant execute on function podio.get_webform(text) to anon, authenticated;

-- Engine: run active simple automations for an app/item/event
create or replace function podio.run_simple_automations(
  p_app uuid, p_item uuid, p_event text, p_actor uuid
)
returns void
language plpgsql security definer set search_path = podio, public as $$
declare
  v_auto record;
  v_cond jsonb;
  v_action jsonb;
  v_ok boolean;
  v_logs jsonb;
  v_actor uuid;
  v_ws uuid; v_org uuid;
begin
  select a.workspace_id, w.organization_id into v_ws, v_org
  from podio.apps a join podio.workspaces w on w.id = a.workspace_id
  where a.id = p_app;

  for v_auto in
    select * from podio.automations
    where app_id = p_app and status = 'active' and kind = 'simple'
      and trigger->>'type' = p_event
  loop
    v_actor := coalesce(p_actor, v_auto.created_by);

    v_ok := true;
    for v_cond in select * from jsonb_array_elements(v_auto.conditions) loop
      if not exists (
        select 1 from podio.item_field_values ifv
        where ifv.item_id = p_item
          and ifv.field_id = (v_cond->>'field_id')::uuid
          and case v_cond->>'op'
            when 'equals' then ifv.value_text = v_cond->>'value'
            when 'not_equals' then ifv.value_text is distinct from v_cond->>'value'
            when 'gt' then ifv.value_number > (v_cond->>'value')::numeric
            when 'lt' then ifv.value_number < (v_cond->>'value')::numeric
            else true
          end
      ) then
        v_ok := false;
      end if;
    end loop;
    if not v_ok then continue; end if;

    v_logs := '[]'::jsonb;
    begin
      for v_action in select * from jsonb_array_elements(v_auto.actions) loop
        case v_action->>'type'
          when 'create_task' then
            if v_actor is not null then
              insert into podio.tasks
                (organization_id, workspace_id, target_type, target_id, title, assignee_id, created_by, due_at)
              values
                (v_org, v_ws, 'item', p_item, v_action->>'title',
                 nullif(v_action->>'assignee_id','')::uuid, v_actor,
                 case when nullif(v_action->>'due_days','') is not null
                   then now() + ((v_action->>'due_days')::int || ' days')::interval end);
              if nullif(v_action->>'assignee_id','') is not null
                 and (v_action->>'assignee_id')::uuid <> v_actor then
                insert into podio.notifications (user_id, event_type, target_type, target_id, actor_id, payload)
                values ((v_action->>'assignee_id')::uuid, 'task_assigned', 'item', p_item, v_actor,
                  jsonb_build_object('task_title', v_action->>'title', 'automation', v_auto.name));
              end if;
            end if;
            v_logs := v_logs || jsonb_build_array(jsonb_build_object('action','create_task','ok',true));
          when 'update_field' then
            insert into podio.item_field_values (item_id, field_id, position, value, value_text, value_number)
            values (p_item, (v_action->>'field_id')::uuid, 0, v_action->'value',
              case when jsonb_typeof(v_action->'value') = 'string' then v_action->'value' #>> '{}' end,
              case when jsonb_typeof(v_action->'value') = 'number' then (v_action->'value' #>> '{}')::numeric end)
            on conflict (item_id, field_id, position) do update
              set value = excluded.value, value_text = excluded.value_text,
                  value_number = excluded.value_number, updated_at = now();
            v_logs := v_logs || jsonb_build_array(jsonb_build_object('action','update_field','ok',true));
          when 'notify' then
            if nullif(v_action->>'user_id','') is not null then
              insert into podio.notifications (user_id, event_type, target_type, target_id, actor_id, payload)
              values ((v_action->>'user_id')::uuid, 'automation', 'item', p_item, v_actor,
                jsonb_build_object('message', v_action->>'message', 'automation', v_auto.name));
            end if;
            v_logs := v_logs || jsonb_build_array(jsonb_build_object('action','notify','ok',true));
          when 'add_comment' then
            if v_actor is not null then
              insert into podio.comments (workspace_id, target_type, target_id, created_by, body)
              values (v_ws, 'item', p_item, v_actor, coalesce(v_action->>'body','(automation comment)'));
            end if;
            v_logs := v_logs || jsonb_build_array(jsonb_build_object('action','add_comment','ok',true));
          else
            v_logs := v_logs || jsonb_build_array(jsonb_build_object('action', v_action->>'type', 'ok', false, 'reason', 'unknown action'));
        end case;
      end loop;

      insert into podio.automation_runs (automation_id, item_id, status, logs, trigger_event, started_at, finished_at)
      values (v_auto.id, p_item, 'success', v_logs, jsonb_build_object('type', p_event), now(), now());
    exception when others then
      insert into podio.automation_runs (automation_id, item_id, status, error, trigger_event, started_at, finished_at)
      values (v_auto.id, p_item, 'failed', SQLERRM, jsonb_build_object('type', p_event), now(), now());
    end;
  end loop;
end $$;

-- Public: submit a form -> creates the item, logs the submission, fires automations
create or replace function podio.submit_webform(
  p_slug text, p_values jsonb, p_submitter_email text default null, p_submitter_name text default null
)
returns uuid
language plpgsql security definer set search_path = podio, public as $$
declare
  v_form podio.webforms;
  v_org uuid; v_ws uuid;
  v_item podio.items;
  v_field record;
  v_val jsonb; v_text text; v_num numeric; v_title text;
begin
  select * into v_form from podio.webforms where slug = p_slug and is_active;
  if v_form.id is null then
    raise exception 'form not found or inactive';
  end if;

  select a.workspace_id, w.organization_id into v_ws, v_org
  from podio.apps a join podio.workspaces w on w.id = a.workspace_id
  where a.id = v_form.app_id;

  insert into podio.items (app_id) values (v_form.app_id) returning * into v_item;

  for v_field in
    select * from podio.app_fields
    where app_id = v_form.app_id and status = 'active'
      and id = any(v_form.field_ids)
      and type not in ('relationship','contact','image','file','calculation','separator')
      and p_values ? id::text
  loop
    v_val := p_values -> v_field.id::text;
    if v_val is null or v_val = 'null'::jsonb or v_val = '""'::jsonb then
      continue;
    end if;
    v_text := case when jsonb_typeof(v_val) = 'string' then v_val #>> '{}' end;
    v_num := case
      when v_field.type = 'money' then nullif(v_val->>'amount','')::numeric
      when jsonb_typeof(v_val) = 'number' then (v_val #>> '{}')::numeric
    end;
    insert into podio.item_field_values
      (item_id, field_id, value, value_text, value_number, value_date, value_date_end)
    values
      (v_item.id, v_field.id, v_val, v_text, v_num,
       case when v_field.type = 'date' then nullif(v_val->>'start','')::timestamptz end,
       case when v_field.type = 'date' then nullif(v_val->>'end','')::timestamptz end);
    if v_field.is_primary then
      v_title := v_text;
    end if;
  end loop;

  if v_title is not null then
    update podio.items set title = v_title where id = v_item.id;
  end if;

  insert into podio.item_revisions (item_id, revision, changes)
  values (v_item.id, 1, p_values);

  insert into podio.webform_submissions (webform_id, item_id, submitter_email, submitter_name, payload)
  values (v_form.id, v_item.id, p_submitter_email, p_submitter_name, p_values);

  insert into podio.activity_events
    (organization_id, workspace_id, app_id, item_id, event_type, target_type, target_id, payload)
  values
    (v_org, v_ws, v_form.app_id, v_item.id, 'form_submitted', 'item', v_item.id,
     jsonb_build_object('item_title', v_title, 'form_title', v_form.title, 'submitter', p_submitter_email));

  perform podio.run_simple_automations(v_form.app_id, v_item.id, 'form_submitted', null);

  return v_item.id;
end $$;
grant execute on function podio.submit_webform(text, jsonb, text, text) to anon, authenticated;

-- save_item v4 = v3 + automation trigger
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

    v_text := case
      when v_field.type in ('file','image') then v_val->>'name'
      when jsonb_typeof(v_val) = 'string' then v_val #>> '{}'
      else null
    end;
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
