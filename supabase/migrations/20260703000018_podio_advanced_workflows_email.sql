-- Podio Clone: Migration 18 - Advanced workflows (delays/branches via run queue + pg_cron),
-- shared action executor, outbound email queue, inbound email-to-app
-- (Identical to the version applied via MCP; kept in full for fresh-project installs.)

alter table podio.automation_runs
  add column if not exists state jsonb not null default '{}'::jsonb,
  add column if not exists scheduled_for timestamptz;

create table podio.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references podio.organizations(id) on delete cascade,
  to_address text not null,
  subject text not null,
  body_text text,
  item_id uuid references podio.items(id) on delete set null,
  status podio.job_status not null default 'queued',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table podio.outbound_emails enable row level security;
create policy p_outbound_emails_select on podio.outbound_emails for select to authenticated
  using (organization_id is not null and podio.is_org_member(organization_id));
grant select on podio.outbound_emails to authenticated;
grant all on podio.outbound_emails to service_role;

create or replace function podio.exec_action(
  p_action jsonb, p_org uuid, p_ws uuid, p_item uuid, p_actor uuid, p_auto_name text
)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
begin
  case p_action->>'type'
    when 'create_task' then
      if p_actor is not null then
        insert into podio.tasks
          (organization_id, workspace_id, target_type, target_id, title, assignee_id, created_by, due_at)
        values
          (p_org, p_ws, 'item', p_item, p_action->>'title',
           nullif(p_action->>'assignee_id','')::uuid, p_actor,
           case when nullif(p_action->>'due_days','') is not null
             then now() + ((p_action->>'due_days')::int || ' days')::interval end);
        if nullif(p_action->>'assignee_id','') is not null
           and (p_action->>'assignee_id')::uuid <> p_actor then
          insert into podio.notifications (user_id, event_type, target_type, target_id, actor_id, payload)
          values ((p_action->>'assignee_id')::uuid, 'task_assigned', 'item', p_item, p_actor,
            jsonb_build_object('task_title', p_action->>'title', 'automation', p_auto_name));
        end if;
      end if;
    when 'update_field' then
      insert into podio.item_field_values (item_id, field_id, position, value, value_text, value_number)
      values (p_item, (p_action->>'field_id')::uuid, 0, p_action->'value',
        case when jsonb_typeof(p_action->'value') = 'string' then p_action->'value' #>> '{}' end,
        case when jsonb_typeof(p_action->'value') = 'number' then (p_action->'value' #>> '{}')::numeric end)
      on conflict (item_id, field_id, position) do update
        set value = excluded.value, value_text = excluded.value_text,
            value_number = excluded.value_number, updated_at = now();
    when 'notify' then
      if nullif(p_action->>'user_id','') is not null then
        insert into podio.notifications (user_id, event_type, target_type, target_id, actor_id, payload)
        values ((p_action->>'user_id')::uuid, 'automation', 'item', p_item, p_actor,
          jsonb_build_object('message', p_action->>'message', 'automation', p_auto_name));
      end if;
    when 'add_comment' then
      if p_actor is not null then
        insert into podio.comments (workspace_id, target_type, target_id, created_by, body)
        values (p_ws, 'item', p_item, p_actor, coalesce(p_action->>'body','(automation comment)'));
      end if;
    when 'send_email' then
      if nullif(p_action->>'to','') is not null then
        insert into podio.outbound_emails (organization_id, to_address, subject, body_text, item_id)
        values (p_org, p_action->>'to',
          coalesce(p_action->>'subject', 'Notification from ' || coalesce(p_auto_name,'automation')),
          p_action->>'body', p_item);
      end if;
    else
      return jsonb_build_object('action', p_action->>'type', 'ok', false, 'reason', 'unknown action');
  end case;
  return jsonb_build_object('action', p_action->>'type', 'ok', true);
end $$;

create or replace function podio.check_condition(p_item uuid, p_cond jsonb)
returns boolean
language sql stable security definer set search_path = podio, public as $$
  select exists (
    select 1 from podio.item_field_values ifv
    where ifv.item_id = p_item
      and ifv.field_id = (p_cond->>'field_id')::uuid
      and case p_cond->>'op'
        when 'equals' then ifv.value_text = p_cond->>'value'
        when 'not_equals' then ifv.value_text is distinct from p_cond->>'value'
        when 'gt' then ifv.value_number > (p_cond->>'value')::numeric
        when 'lt' then ifv.value_number < (p_cond->>'value')::numeric
        else true
      end
  );
$$;

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
      if not podio.check_condition(p_item, v_cond) then
        v_ok := false;
      end if;
    end loop;
    if not v_ok then continue; end if;

    v_logs := '[]'::jsonb;
    begin
      for v_action in select * from jsonb_array_elements(v_auto.actions) loop
        v_logs := v_logs || jsonb_build_array(
          podio.exec_action(v_action, v_org, v_ws, p_item, v_actor, v_auto.name));
      end loop;
      insert into podio.automation_runs (automation_id, item_id, status, logs, trigger_event, started_at, finished_at)
      values (v_auto.id, p_item, 'success', v_logs, jsonb_build_object('type', p_event), now(), now());
    exception when others then
      insert into podio.automation_runs (automation_id, item_id, status, error, trigger_event, started_at, finished_at)
      values (v_auto.id, p_item, 'failed', SQLERRM, jsonb_build_object('type', p_event), now(), now());
    end;
  end loop;

  insert into podio.automation_runs (automation_id, item_id, status, state, trigger_event, scheduled_for)
  select a.id, p_item, 'pending',
    jsonb_build_object('queue', coalesce(a.definition->'steps', '[]'::jsonb)),
    jsonb_build_object('type', p_event, 'actor', p_actor),
    now()
  from podio.automations a
  where a.app_id = p_app and a.status = 'active' and a.kind = 'advanced'
    and a.trigger->>'type' = p_event;
end $$;

create or replace function podio.process_automation_run(p_run uuid)
returns void
language plpgsql security definer set search_path = podio, public as $$
declare
  v_run podio.automation_runs;
  v_auto podio.automations;
  v_org uuid; v_ws uuid;
  v_actor uuid;
  v_queue jsonb;
  v_step jsonb;
  v_logs jsonb;
begin
  select * into v_run from podio.automation_runs where id = p_run and status = 'pending';
  if v_run.id is null then return; end if;
  select * into v_auto from podio.automations where id = v_run.automation_id;
  if v_auto.id is null then
    update podio.automation_runs set status = 'cancelled', finished_at = now() where id = p_run;
    return;
  end if;
  select a.workspace_id, w.organization_id into v_ws, v_org
  from podio.apps a join podio.workspaces w on w.id = a.workspace_id
  where a.id = v_auto.app_id;

  v_actor := coalesce(nullif(v_run.trigger_event->>'actor','')::uuid, v_auto.created_by);
  v_queue := coalesce(v_run.state->'queue', '[]'::jsonb);
  v_logs := coalesce(v_run.logs, '[]'::jsonb);

  update podio.automation_runs set status = 'running', started_at = coalesce(started_at, now())
  where id = p_run;

  begin
    while jsonb_array_length(v_queue) > 0 loop
      v_step := v_queue -> 0;
      v_queue := v_queue - 0;

      if v_step->>'type' = 'action' then
        v_logs := v_logs || jsonb_build_array(
          podio.exec_action(v_step->'config', v_org, v_ws, v_run.item_id, v_actor, v_auto.name));
      elsif v_step->>'type' = 'delay' then
        update podio.automation_runs
        set status = 'pending',
            scheduled_for = now() + (coalesce((v_step->>'hours')::numeric, 1) || ' hours')::interval,
            state = jsonb_build_object('queue', v_queue),
            logs = v_logs || jsonb_build_array(jsonb_build_object('action','delay','hours', v_step->>'hours','ok',true))
        where id = p_run;
        return;
      elsif v_step->>'type' = 'branch' then
        if podio.check_condition(v_run.item_id, v_step->'condition') then
          v_queue := coalesce(v_step->'then', '[]'::jsonb) || v_queue;
          v_logs := v_logs || jsonb_build_array(jsonb_build_object('action','branch','took','then'));
        else
          v_queue := coalesce(v_step->'else', '[]'::jsonb) || v_queue;
          v_logs := v_logs || jsonb_build_array(jsonb_build_object('action','branch','took','else'));
        end if;
      end if;
    end loop;

    update podio.automation_runs
    set status = 'success', logs = v_logs, state = '{}'::jsonb, finished_at = now()
    where id = p_run;
  exception when others then
    update podio.automation_runs
    set status = 'failed', error = SQLERRM, logs = v_logs, finished_at = now()
    where id = p_run;
  end;
end $$;

create or replace function podio.process_due_automation_runs()
returns int
language plpgsql security definer set search_path = podio, public as $$
declare
  v_run record;
  v_count int := 0;
begin
  for v_run in
    select id from podio.automation_runs
    where status = 'pending' and coalesce(scheduled_for, now()) <= now()
    order by created_at
    limit 25
  loop
    perform podio.process_automation_run(v_run.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

do $$
begin
  perform cron.schedule('podio_process_automations', '* * * * *',
    'select podio.process_due_automation_runs()');
exception when others then null;
end $$;

create or replace function podio.process_inbound_email(
  p_to text, p_from text, p_subject text, p_body_text text, p_body_html text default null
)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_addr podio.app_email_addresses;
  v_item podio.items;
  v_values jsonb := '{}'::jsonb;
  v_subject_field uuid;
  v_body_field uuid;
begin
  select * into v_addr from podio.app_email_addresses
  where lower(address) = lower(trim(p_to)) and is_active;
  if v_addr.id is null then
    insert into podio.inbound_emails (app_email_id, from_address, subject, body_text, error)
    select id, p_from, p_subject, p_body_text, 'address inactive'
    from podio.app_email_addresses where lower(address) = lower(trim(p_to));
    return jsonb_build_object('processed', false, 'reason', 'unknown or inactive address');
  end if;

  v_subject_field := nullif(v_addr.field_mapping->>'subject_field_id','')::uuid;
  v_body_field := nullif(v_addr.field_mapping->>'body_field_id','')::uuid;
  if v_subject_field is null then
    select id into v_subject_field from podio.app_fields
    where app_id = v_addr.app_id and is_primary and status = 'active' limit 1;
  end if;

  insert into podio.items (app_id) values (v_addr.app_id) returning * into v_item;

  if v_subject_field is not null and p_subject is not null then
    v_values := v_values || jsonb_build_object(v_subject_field::text, to_jsonb(p_subject));
  end if;
  if v_body_field is not null and p_body_text is not null then
    v_values := v_values || jsonb_build_object(v_body_field::text, to_jsonb(p_body_text));
  end if;
  perform podio.write_values(v_addr.app_id, v_item.id, v_values, null);

  insert into podio.inbound_emails (app_email_id, item_id, from_address, subject, body_text, body_html, processed_at)
  values (v_addr.id, v_item.id, p_from, p_subject, p_body_text, p_body_html, now());

  insert into podio.activity_events
    (organization_id, workspace_id, app_id, item_id, event_type, target_type, target_id, payload)
  select w.organization_id, a.workspace_id, a.id, v_item.id, 'email_received', 'item', v_item.id,
    jsonb_build_object('from', p_from, 'subject', p_subject)
  from podio.apps a join podio.workspaces w on w.id = a.workspace_id
  where a.id = v_addr.app_id;

  perform podio.run_simple_automations(v_addr.app_id, v_item.id, 'email_received', null);

  return jsonb_build_object('processed', true, 'item_id', v_item.id);
end $$;
grant execute on function podio.process_inbound_email(text, text, text, text, text) to anon, authenticated;
