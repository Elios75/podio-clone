-- Podio Clone: Migration 35 - Phase 12a: automation core depth
-- New triggers: comment_added (DB trigger), task_completed (DB trigger),
--   date_reached (cron scan of date shadow columns w/ dedup table), manual run RPC.
-- New actions: http_request (pg_net, mirrors webhook delivery), update_related_item.
-- Test mode: dry runs recorded to automation_runs with is_test = true.

-- ============================================================
-- 1) exec_action: add http_request + update_related_item
-- ============================================================
create or replace function podio.exec_action(
  p_action jsonb, p_org uuid, p_ws uuid, p_item uuid, p_actor uuid, p_auto_name text
)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_req bigint;
  v_url text;
  v_method text;
  v_cnt int;
  v_rel record;
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
    when 'http_request' then
      v_url := nullif(p_action->>'url','');
      if v_url is null or v_url !~* '^https?://' then
        return jsonb_build_object('action','http_request','ok',false,'reason','invalid url');
      end if;
      v_method := lower(coalesce(nullif(p_action->>'method',''), 'post'));
      if v_method = 'get' then
        select net.http_get(
          url := v_url,
          headers := coalesce(p_action->'headers','{}'::jsonb)
        ) into v_req;
      else
        select net.http_post(
          url := v_url,
          body := coalesce(p_action->'body',
            jsonb_build_object('item_id', p_item::text, 'automation', coalesce(p_auto_name,''))),
          headers := jsonb_build_object('Content-Type','application/json')
            || coalesce(p_action->'headers','{}'::jsonb)
        ) into v_req;
      end if;
      return jsonb_build_object('action','http_request','ok',true,
        'method', v_method, 'request_id', v_req);
    when 'update_related_item' then
      if nullif(p_action->>'field_id','') is null then
        return jsonb_build_object('action','update_related_item','ok',false,'reason','missing field_id');
      end if;
      v_cnt := 0;
      for v_rel in
        select distinct case when r.from_item_id = p_item then r.to_item_id else r.from_item_id end as rid
        from podio.item_relationships r
        where (r.from_item_id = p_item or r.to_item_id = p_item)
          and (nullif(p_action->>'relationship_field_id','') is null
               or r.field_id = (p_action->>'relationship_field_id')::uuid)
        limit 50
      loop
        insert into podio.item_field_values (item_id, field_id, position, value, value_text, value_number)
        values (v_rel.rid, (p_action->>'field_id')::uuid, 0, p_action->'value',
          case when jsonb_typeof(p_action->'value') = 'string' then p_action->'value' #>> '{}' end,
          case when jsonb_typeof(p_action->'value') = 'number' then (p_action->'value' #>> '{}')::numeric end)
        on conflict (item_id, field_id, position) do update
          set value = excluded.value, value_text = excluded.value_text,
              value_number = excluded.value_number, updated_at = now();
        v_cnt := v_cnt + 1;
      end loop;
      return jsonb_build_object('action','update_related_item','ok',true,'updated', v_cnt);
    else
      return jsonb_build_object('action', p_action->>'type', 'ok', false, 'reason', 'unknown action');
  end case;
  return jsonb_build_object('action', p_action->>'type', 'ok', true);
end $$;

-- ============================================================
-- 2) execute_automation: run ONE automation against ONE item.
--    Shared by manual runs, test (dry) runs, and the date cron.
--    Dry runs evaluate conditions and list actions without executing.
-- ============================================================
create or replace function podio.execute_automation(
  p_automation uuid, p_item uuid, p_event jsonb, p_actor uuid, p_dry_run boolean default false
)
returns uuid
language plpgsql security definer set search_path = podio, public as $$
declare
  v_auto podio.automations;
  v_org uuid; v_ws uuid;
  v_actor uuid;
  v_cond jsonb; v_action jsonb;
  v_ok boolean := true;
  v_logs jsonb := '[]'::jsonb;
  v_run uuid;
begin
  select * into v_auto from podio.automations where id = p_automation;
  if v_auto.id is null then raise exception 'automation not found'; end if;

  select a.workspace_id, w.organization_id into v_ws, v_org
  from podio.apps a join podio.workspaces w on w.id = a.workspace_id
  where a.id = v_auto.app_id;

  v_actor := coalesce(p_actor, v_auto.created_by);

  for v_cond in select * from jsonb_array_elements(v_auto.conditions) loop
    if not podio.check_condition(p_item, v_cond) then v_ok := false; end if;
  end loop;

  if not v_ok then
    insert into podio.automation_runs
      (automation_id, item_id, status, logs, trigger_event, is_test, started_at, finished_at)
    values (v_auto.id, p_item, 'cancelled',
      jsonb_build_array(jsonb_build_object('action','conditions','ok',false,'reason','conditions not met')),
      p_event, p_dry_run, now(), now())
    returning id into v_run;
    return v_run;
  end if;

  if p_dry_run then
    if v_auto.kind = 'advanced' then
      select coalesce(jsonb_agg(jsonb_build_object(
          'action', coalesce(s->'config'->>'type', s->>'type'), 'ok', true, 'dry_run', true)), '[]'::jsonb)
      into v_logs
      from jsonb_array_elements(coalesce(v_auto.definition->'steps','[]'::jsonb)) s;
    else
      select coalesce(jsonb_agg(jsonb_build_object(
          'action', a->>'type', 'ok', true, 'dry_run', true)), '[]'::jsonb)
      into v_logs
      from jsonb_array_elements(v_auto.actions) a;
    end if;
    insert into podio.automation_runs
      (automation_id, item_id, status, logs, trigger_event, is_test, started_at, finished_at)
    values (v_auto.id, p_item, 'success', v_logs, p_event, true, now(), now())
    returning id into v_run;
    return v_run;
  end if;

  if v_auto.kind = 'advanced' then
    insert into podio.automation_runs
      (automation_id, item_id, status, state, trigger_event, is_test, scheduled_for)
    values (v_auto.id, p_item, 'pending',
      jsonb_build_object('queue', coalesce(v_auto.definition->'steps','[]'::jsonb)),
      p_event, false, now())
    returning id into v_run;
    return v_run;
  end if;

  begin
    for v_action in select * from jsonb_array_elements(v_auto.actions) loop
      v_logs := v_logs || jsonb_build_array(
        podio.exec_action(v_action, v_org, v_ws, p_item, v_actor, v_auto.name));
    end loop;
    insert into podio.automation_runs
      (automation_id, item_id, status, logs, trigger_event, is_test, started_at, finished_at)
    values (v_auto.id, p_item, 'success', v_logs, p_event, false, now(), now())
    returning id into v_run;
  exception when others then
    insert into podio.automation_runs
      (automation_id, item_id, status, error, logs, trigger_event, is_test, started_at, finished_at)
    values (v_auto.id, p_item, 'failed', SQLERRM, v_logs, p_event, false, now(), now())
    returning id into v_run;
  end;
  return v_run;
end $$;

-- ============================================================
-- 3) Manual "Run now" / "Test" RPC (workspace members only)
-- ============================================================
create or replace function podio.run_automation_now(
  p_automation uuid, p_item uuid, p_test boolean default false
)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_auto podio.automations;
  v_run uuid;
  v_row podio.automation_runs;
begin
  select * into v_auto from podio.automations where id = p_automation;
  if v_auto.id is null then raise exception 'automation not found'; end if;
  if not podio.is_workspace_member(v_auto.workspace_id) then
    raise exception 'no access to automation';
  end if;
  perform 1 from podio.items i
  where i.id = p_item and i.app_id = v_auto.app_id and not i.is_deleted;
  if not found then raise exception 'item not found in this app'; end if;

  v_run := podio.execute_automation(p_automation, p_item,
    jsonb_build_object('type','manual','actor', auth.uid()::text), auth.uid(), p_test);

  select * into v_row from podio.automation_runs where id = v_run;
  return jsonb_build_object('run_id', v_row.id, 'status', v_row.status,
    'logs', v_row.logs, 'error', v_row.error, 'is_test', v_row.is_test);
end $$;
grant execute on function podio.run_automation_now(uuid, uuid, boolean) to authenticated;

-- ============================================================
-- 4) comment_added trigger (fires for any insert path: RPC, client, API)
--    pg_trigger_depth() guard prevents add_comment-action recursion.
-- ============================================================
create or replace function podio.trg_comment_automations()
returns trigger
language plpgsql security definer set search_path = podio, public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.target_type = 'item' then
    perform podio.run_simple_automations(i.app_id, new.target_id, 'comment_added', new.created_by)
    from podio.items i
    where i.id = new.target_id and not i.is_deleted;
  end if;
  return new;
end $$;

drop trigger if exists trg_comments_automation on podio.comments;
create trigger trg_comments_automation
after insert on podio.comments
for each row execute function podio.trg_comment_automations();

-- ============================================================
-- 5) task_completed trigger (fires on the completed_at transition,
--    covering complete_task RPC and any direct update path)
-- ============================================================
create or replace function podio.trg_task_completed_automations()
returns trigger
language plpgsql security definer set search_path = podio, public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.completed_at is not null and old.completed_at is null
     and new.target_type = 'item' and new.target_id is not null then
    perform podio.run_simple_automations(
      i.app_id, new.target_id, 'task_completed', coalesce(new.completed_by, new.assignee_id))
    from podio.items i
    where i.id = new.target_id and not i.is_deleted;
  end if;
  return new;
end $$;

drop trigger if exists trg_tasks_completed_automation on podio.tasks;
create trigger trg_tasks_completed_automation
after update on podio.tasks
for each row execute function podio.trg_task_completed_automations();

-- ============================================================
-- 6) date_reached: cron scans indexed value_date shadow column.
--    Dedup table lets an automation re-fire if the date value changes.
--    trigger config: { type:'date_reached', field_id, offset_days }
--    offset_days: 0 = on the date, -1 = day before, 7 = a week after (UTC dates).
-- ============================================================
create table if not exists podio.automation_date_fires (
  automation_id uuid not null references podio.automations(id) on delete cascade,
  item_id uuid not null references podio.items(id) on delete cascade,
  fire_on date not null,
  created_at timestamptz not null default now(),
  primary key (automation_id, item_id, fire_on)
);
alter table podio.automation_date_fires enable row level security;
create policy p_auto_date_fires_select on podio.automation_date_fires for select to authenticated
  using (exists (select 1 from podio.automations a where a.id = automation_id
    and podio.is_workspace_member(a.workspace_id)));
grant select on podio.automation_date_fires to authenticated;
grant all on podio.automation_date_fires to service_role;

create or replace function podio.process_date_triggers()
returns int
language plpgsql security definer set search_path = podio, public as $$
declare
  v_auto record;
  v_item record;
  v_field uuid;
  v_offset int;
  v_count int := 0;
begin
  for v_auto in
    select * from podio.automations
    where status = 'active'
      and trigger->>'type' = 'date_reached'
      and app_id is not null
      and nullif(trigger->>'field_id','') is not null
  loop
    v_field := (v_auto.trigger->>'field_id')::uuid;
    v_offset := coalesce(nullif(v_auto.trigger->>'offset_days','')::int, 0);

    for v_item in
      select i.id
      from podio.items i
      join podio.item_field_values ifv
        on ifv.item_id = i.id and ifv.field_id = v_field
      where i.app_id = v_auto.app_id
        and not i.is_deleted
        and ifv.value_date is not null
        and (ifv.value_date::date + v_offset) = current_date
        and not exists (
          select 1 from podio.automation_date_fires f
          where f.automation_id = v_auto.id and f.item_id = i.id and f.fire_on = current_date)
      limit 100
    loop
      insert into podio.automation_date_fires (automation_id, item_id, fire_on)
      values (v_auto.id, v_item.id, current_date)
      on conflict do nothing;
      perform podio.execute_automation(v_auto.id, v_item.id,
        jsonb_build_object('type','date_reached','fire_on', current_date::text),
        v_auto.created_by, false);
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end $$;

do $$
begin
  perform cron.schedule('podio_process_date_triggers', '*/15 * * * *',
    'select podio.process_date_triggers()');
exception when others then null;
end $$;
