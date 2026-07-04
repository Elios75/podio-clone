-- Podio Clone: Migration 13 - Task RPCs (assignment notifications cross RLS boundaries)

create or replace function podio.create_task(
  p_org uuid,
  p_ws uuid,
  p_title text,
  p_description text default null,
  p_assignee uuid default null,
  p_due timestamptz default null,
  p_target_type podio.object_type default null,
  p_target_id uuid default null
)
returns podio.tasks
language plpgsql security definer set search_path = podio, public as $$
declare
  v_task podio.tasks;
  v_item_title text;
begin
  if not podio.is_org_member(p_org) then
    raise exception 'not an organization member';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'task title required';
  end if;

  insert into podio.tasks
    (organization_id, workspace_id, target_type, target_id, title, description,
     assignee_id, created_by, due_at)
  values
    (p_org, p_ws, p_target_type, p_target_id, p_title, p_description,
     p_assignee, auth.uid(), p_due)
  returning * into v_task;

  if p_target_type = 'item' and p_target_id is not null then
    select title into v_item_title from podio.items where id = p_target_id;
  end if;

  if p_assignee is not null and p_assignee <> auth.uid() then
    insert into podio.notifications (user_id, event_type, target_type, target_id, actor_id, payload)
    values (p_assignee, 'task_assigned', coalesce(p_target_type, 'task'),
      coalesce(p_target_id, v_task.id), auth.uid(),
      jsonb_build_object('task_title', p_title, 'item_title', v_item_title,
        'due_at', p_due));
  end if;

  if p_ws is not null then
    insert into podio.activity_events
      (organization_id, workspace_id, item_id, actor_id, event_type, target_type, target_id, payload)
    values
      (p_org, p_ws, case when p_target_type = 'item' then p_target_id end,
       auth.uid(), 'task_created', 'task', v_task.id,
       jsonb_build_object('task_title', p_title, 'item_title', v_item_title));
  end if;

  return v_task;
end $$;
grant execute on function podio.create_task(uuid, uuid, text, text, uuid, timestamptz, podio.object_type, uuid) to authenticated;

create or replace function podio.complete_task(p_task uuid)
returns podio.tasks
language plpgsql security definer set search_path = podio, public as $$
declare
  v_task podio.tasks;
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
grant execute on function podio.complete_task(uuid) to authenticated;
