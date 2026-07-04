-- Podio Clone: Migration 12 - Collaboration: add_comment RPC (mentions + notifications + activity),
-- save_item v3 (activity events + auto-follow), realtime on comments
-- NOTE: identical to the version applied via MCP on 2026-07-03; see repo history.

-- add_comment: comment + auto-follow + mention rows + notification fanout + activity, atomically
create or replace function podio.add_comment(p_item uuid, p_body text, p_mentions uuid[] default '{}')
returns podio.comments
language plpgsql security definer set search_path = podio, public as $$
declare
  v_ws uuid; v_org uuid; v_app uuid; v_title text;
  v_comment podio.comments;
  u uuid;
begin
  if not podio.can_access_item(p_item) then
    raise exception 'no access to item';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'comment body required';
  end if;

  select a.workspace_id, w.organization_id, a.id, i.title
    into v_ws, v_org, v_app, v_title
  from podio.items i
  join podio.apps a on a.id = i.app_id
  join podio.workspaces w on w.id = a.workspace_id
  where i.id = p_item;

  insert into podio.comments (workspace_id, target_type, target_id, created_by, body)
  values (v_ws, 'item', p_item, auth.uid(), p_body)
  returning * into v_comment;

  insert into podio.item_followers (item_id, user_id)
  values (p_item, auth.uid())
  on conflict do nothing;

  foreach u in array p_mentions loop
    insert into podio.mentions (source_type, source_id, mentioned_user_id, created_by)
    values ('comment', v_comment.id, u, auth.uid());
    if u <> auth.uid() then
      insert into podio.notifications (user_id, event_type, target_type, target_id, actor_id, payload)
      values (u, 'mentioned', 'item', p_item, auth.uid(),
        jsonb_build_object('item_title', v_title, 'preview', left(p_body, 140)));
    end if;
  end loop;

  insert into podio.notifications (user_id, event_type, target_type, target_id, actor_id, payload)
  select f.user_id, 'comment_added', 'item', p_item, auth.uid(),
    jsonb_build_object('item_title', v_title, 'preview', left(p_body, 140))
  from podio.item_followers f
  where f.item_id = p_item
    and f.user_id <> auth.uid()
    and not (f.user_id = any(p_mentions));

  insert into podio.activity_events
    (organization_id, workspace_id, app_id, item_id, actor_id, event_type, target_type, target_id, payload)
  values
    (v_org, v_ws, v_app, p_item, auth.uid(), 'comment_added', 'comment', v_comment.id,
     jsonb_build_object('item_title', v_title, 'preview', left(p_body, 140)));

  return v_comment;
end $$;
grant execute on function podio.add_comment(uuid, text, uuid[]) to authenticated;

-- save_item v3: adds activity events + creator auto-follow
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

  return v_item;
end $$;

-- Realtime for live comments (ignore if publication is absent)
do $$
begin
  alter publication supabase_realtime add table podio.comments;
exception when others then null;
end $$;
