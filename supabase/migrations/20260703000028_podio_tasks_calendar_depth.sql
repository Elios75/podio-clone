-- Podio Clone: Migration 28 - Repeating tasks, reminders, personal calendar ICS feed
-- (Identical to the version applied via MCP.)

-- complete_task v2: completing a repeating task materializes the next occurrence
create or replace function podio.complete_task(p_task uuid)
returns podio.tasks
language plpgsql security definer set search_path = podio, public as $$
declare
  v_task podio.tasks;
  v_next timestamptz;
  v_every text;
  v_n int;
begin
  select * into v_task from podio.tasks where id = p_task;
  if v_task.id is null then
    raise exception 'task not found';
  end if;
  if not (v_task.assignee_id = auth.uid() or v_task.created_by = auth.uid()
    or (v_task.workspace_id is not null and podio.is_workspace_member(v_task.workspace_id))) then
    raise exception 'no access to task';
  end if;

  update podio.tasks
  set status = 'completed', completed_at = now(), completed_by = auth.uid()
  where id = p_task
  returning * into v_task;

  if v_task.repeat_rule ? 'every' then
    v_every := v_task.repeat_rule->>'every';
    v_n := greatest(coalesce((v_task.repeat_rule->>'interval')::int, 1), 1);
    v_next := coalesce(v_task.due_at, now()) + case v_every
      when 'day' then (v_n || ' days')::interval
      when 'week' then (v_n || ' weeks')::interval
      when 'month' then (v_n || ' months')::interval
      else null end;
    if v_next is not null then
      insert into podio.tasks
        (organization_id, workspace_id, target_type, target_id, title, description,
         assignee_id, created_by, due_at, reminder_at, repeat_rule)
      values
        (v_task.organization_id, v_task.workspace_id, v_task.target_type, v_task.target_id,
         v_task.title, v_task.description, v_task.assignee_id, v_task.created_by,
         v_next,
         case when v_task.reminder_at is not null and v_task.due_at is not null
           then v_next - (v_task.due_at - v_task.reminder_at) end,
         v_task.repeat_rule);
    end if;
  end if;

  if v_task.created_by <> auth.uid() then
    insert into podio.notifications (user_id, event_type, target_type, target_id, actor_id, payload)
    values (v_task.created_by, 'task_completed', 'task', v_task.id, auth.uid(),
      jsonb_build_object('task_title', v_task.title));
  end if;
  if v_task.workspace_id is not null then
    insert into podio.activity_events
      (organization_id, workspace_id, item_id, actor_id, event_type, target_type, target_id, payload)
    values
      (v_task.organization_id, v_task.workspace_id,
       case when v_task.target_type = 'item' then v_task.target_id end,
       auth.uid(), 'task_completed', 'task', v_task.id,
       jsonb_build_object('task_title', v_task.title));
  end if;
  return v_task;
end $$;

create or replace function podio.process_task_reminders()
returns int
language plpgsql security definer set search_path = podio, public as $$
declare
  v_count int;
begin
  with due as (
    update podio.tasks
    set reminder_at = null
    where status = 'open' and reminder_at is not null and reminder_at <= now()
      and assignee_id is not null
    returning id, title, assignee_id, due_at
  )
  insert into podio.notifications (user_id, event_type, target_type, target_id, payload)
  select assignee_id, 'task_reminder', 'task', id,
    jsonb_build_object('task_title', title, 'due_at', due_at)
  from due;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

do $$
begin
  perform cron.schedule('podio_task_reminders', '*/5 * * * *',
    'select podio.process_task_reminders()');
exception when others then null;
end $$;

create or replace function podio.get_or_create_ics_token()
returns text
language plpgsql security definer set search_path = podio, public as $$
declare
  v_token text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select notification_prefs->>'ics_token' into v_token
  from podio.user_profiles where user_id = auth.uid();
  if v_token is null then
    v_token := md5(random()::text || clock_timestamp()::text);
    update podio.user_profiles
    set notification_prefs = coalesce(notification_prefs, '{}'::jsonb)
      || jsonb_build_object('ics_token', v_token)
    where user_id = auth.uid();
  end if;
  return v_token;
end $$;
grant execute on function podio.get_or_create_ics_token() to authenticated;

create or replace function podio.calendar_feed(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = podio, public as $$
declare
  v_user uuid;
begin
  select user_id into v_user from podio.user_profiles
  where notification_prefs->>'ics_token' = p_token;
  if v_user is null then
    raise exception 'invalid token';
  end if;

  return coalesce((
    select jsonb_agg(e) from (
      select 'task-' || t.id as uid, t.title as summary, t.due_at as starts
      from podio.tasks t
      where t.assignee_id = v_user and t.status = 'open' and t.due_at is not null
      union all
      select distinct 'item-' || i.id || '-' || ifv.field_id,
        coalesce(i.title, '#' || i.item_number) || ' (' || a.name || ')',
        ifv.value_date
      from podio.item_field_values ifv
      join podio.items i on i.id = ifv.item_id and not i.is_deleted
      join podio.apps a on a.id = i.app_id
      join podio.workspace_members wm
        on wm.workspace_id = a.workspace_id and wm.user_id = v_user
      where ifv.value_date is not null
        and ifv.value_date > now() - interval '30 days'
        and ifv.value_date < now() + interval '365 days'
    ) e), '[]'::jsonb);
end $$;
grant execute on function podio.calendar_feed(text) to anon, authenticated;
