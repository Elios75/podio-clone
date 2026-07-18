-- Podio Clone: Migration 81 - Hooks API: field/space-level webhooks, wider event set,
-- hooks_api RPC backing the public /api/v1/hooks endpoints.
--
-- Builds ON podio.webhooks / podio.webhook_deliveries (migrations 5, 19, 36):
--   * verification: the table already has verify_token + is_verified and a hook.verify
--     delivery queued on insert (migration 36) — reused as-is, no status/verification_token
--     columns duplicated ('unverified' = not is_verified, 'active' = is_verified).
--   * delivery: same path as migration 19 — rows inserted into webhook_deliveries as
--     'pending' and shipped by process_webhook_deliveries() (pg_net + cron backoff).
-- podio.api_request is NOT modified; hooks_api replicates its key-validation +
-- rate-limit + write-scope pattern inline against the same podio.api_keys table.

-- 1) Scope columns: field-level and space-level hooks (existing rows stay app-level)
alter table podio.webhooks
  add column if not exists field_id uuid references podio.app_fields(id) on delete cascade,
  add column if not exists workspace_id uuid references podio.workspaces(id) on delete cascade;

create index if not exists idx_webhooks_ws on podio.webhooks (workspace_id) where is_active;
create index if not exists idx_webhooks_field on podio.webhooks (field_id) where is_active;

-- 2) Shared fan-out helper: inserts pending webhook_deliveries for every matching
--    active+verified hook (exact mechanism of migration 19's tg_emit_webhooks, extended
--    with workspace- and field-level matching). The pg_net cron dispatcher picks them up.
create or replace function podio.emit_webhook_event(
  p_org uuid, p_ws uuid, p_app uuid, p_item uuid,
  p_event text, p_target_type text, p_target_id uuid,
  p_data jsonb default '{}'::jsonb, p_field uuid default null
) returns void
language sql security definer set search_path = podio, public as $$
  insert into podio.webhook_deliveries (webhook_id, event_type, payload, status)
  select w.id, p_event,
    jsonb_build_object(
      'event', p_event,
      'organization_id', p_org,
      'workspace_id', p_ws,
      'app_id', p_app,
      'item_id', p_item,
      'target_type', p_target_type,
      'target_id', p_target_id,
      'data', coalesce(p_data, '{}'::jsonb),
      'occurred_at', now()),
    'pending'
  from podio.webhooks w
  where p_org is not null
    and w.organization_id = p_org
    and w.is_active and w.is_verified
    and p_event = any(w.events)
    and case
          when w.workspace_id is not null then w.workspace_id = p_ws  -- space-level hook
          else (w.app_id is null or w.app_id = p_app)                 -- org-/app-level hook
        end
    and (w.field_id is null or w.field_id = p_field);
$$;

-- Re-route the existing activity_events fan-out through the shared helper so
-- workspace-level and field-level hooks also receive item/task/etc. events.
-- (The trg_emit_webhooks trigger on podio.activity_events stays in place.)
create or replace function podio.tg_emit_webhooks() returns trigger
language plpgsql security definer set search_path = podio, public as $$
begin
  perform podio.emit_webhook_event(
    new.organization_id, new.workspace_id, new.app_id, new.item_id,
    new.event_type, new.target_type::text, new.target_id, new.payload,
    nullif(new.payload->>'field_id','')::uuid);
  return new;
end $$;

-- 3) Widened event set: triggers on the real tables, all delivering through
--    emit_webhook_event (no activity_events pollution).

-- comment.delete (soft delete via deleted_at, plus hard delete)
create or replace function podio.tg_hook_comment_delete() returns trigger
language plpgsql security definer set search_path = podio, public as $$
declare
  v_ws uuid := old.workspace_id;
  v_item_ws uuid;
  v_org uuid;
  v_app uuid;
  v_item uuid;
begin
  if old.target_type = 'item' then
    select i.id, i.app_id, a.workspace_id into v_item, v_app, v_item_ws
    from podio.items i join podio.apps a on a.id = i.app_id
    where i.id = old.target_id;
    v_ws := coalesce(v_ws, v_item_ws);
  end if;
  select organization_id into v_org from podio.workspaces where id = v_ws;
  perform podio.emit_webhook_event(v_org, v_ws, v_app, v_item,
    'comment.delete', 'comment', old.id,
    jsonb_build_object('comment_id', old.id,
      'target_type', old.target_type, 'target_id', old.target_id));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_hook_comment_soft_delete on podio.comments;
create trigger trg_hook_comment_soft_delete after update on podio.comments
for each row when (old.deleted_at is null and new.deleted_at is not null)
execute function podio.tg_hook_comment_delete();

drop trigger if exists trg_hook_comment_delete on podio.comments;
create trigger trg_hook_comment_delete after delete on podio.comments
for each row execute function podio.tg_hook_comment_delete();

-- app.update / app.delete
create or replace function podio.tg_hook_app_events() returns trigger
language plpgsql security definer set search_path = podio, public as $$
declare
  v_row podio.apps := coalesce(new, old);
  v_org uuid;
begin
  select organization_id into v_org from podio.workspaces where id = v_row.workspace_id;
  perform podio.emit_webhook_event(v_org, v_row.workspace_id, v_row.id, null,
    case when tg_op = 'DELETE' then 'app.delete' else 'app.update' end,
    'app', v_row.id,
    jsonb_build_object('app_id', v_row.id, 'name', v_row.name, 'slug', v_row.slug,
      'is_archived', v_row.is_archived));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_hook_app_update on podio.apps;
create trigger trg_hook_app_update after update on podio.apps
for each row when (
  old.name is distinct from new.name
  or old.slug is distinct from new.slug
  or old.icon is distinct from new.icon
  or old.description is distinct from new.description
  or old.usage_instructions is distinct from new.usage_instructions
  or old.item_name is distinct from new.item_name
  or old.layout_settings is distinct from new.layout_settings
  or old.permissions is distinct from new.permissions
  or old.is_archived is distinct from new.is_archived)
execute function podio.tg_hook_app_events();

drop trigger if exists trg_hook_app_delete on podio.apps;
create trigger trg_hook_app_delete after delete on podio.apps
for each row execute function podio.tg_hook_app_events();

-- tag.add / tag.delete (podio.tags + podio.item_tags exist — migration 2)
create or replace function podio.tg_hook_item_tags() returns trigger
language plpgsql security definer set search_path = podio, public as $$
declare
  v_row podio.item_tags := coalesce(new, old);
  v_org uuid;
  v_ws uuid;
  v_app uuid;
  v_tag text;
begin
  select i.app_id, a.workspace_id, w.organization_id into v_app, v_ws, v_org
  from podio.items i
  join podio.apps a on a.id = i.app_id
  join podio.workspaces w on w.id = a.workspace_id
  where i.id = v_row.item_id;
  select name into v_tag from podio.tags where id = v_row.tag_id;
  perform podio.emit_webhook_event(v_org, v_ws, v_app, v_row.item_id,
    case when tg_op = 'DELETE' then 'tag.delete' else 'tag.add' end,
    'item', v_row.item_id,
    jsonb_build_object('tag_id', v_row.tag_id, 'tag', v_tag));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_hook_tag_add on podio.item_tags;
create trigger trg_hook_tag_add after insert on podio.item_tags
for each row execute function podio.tg_hook_item_tags();

drop trigger if exists trg_hook_tag_delete on podio.item_tags;
create trigger trg_hook_tag_delete after delete on podio.item_tags
for each row execute function podio.tg_hook_item_tags();

-- file.change (rename / new version / relocated content)
create or replace function podio.tg_hook_file_change() returns trigger
language plpgsql security definer set search_path = podio, public as $$
begin
  perform podio.emit_webhook_event(new.organization_id, new.workspace_id, null, null,
    'file.change', 'file', new.id,
    jsonb_build_object('file_id', new.id, 'name', new.name, 'version', new.version,
      'mime_type', new.mime_type, 'size_bytes', new.size_bytes));
  return new;
end $$;

drop trigger if exists trg_hook_file_change on podio.files;
create trigger trg_hook_file_change after update on podio.files
for each row when (
  old.version is distinct from new.version
  or old.name is distinct from new.name
  or old.storage_path is distinct from new.storage_path
  or old.external_url is distinct from new.external_url)
execute function podio.tg_hook_file_change();

-- form.create / form.update / form.delete (podio.webforms exists — migration 4)
create or replace function podio.tg_hook_webform_events() returns trigger
language plpgsql security definer set search_path = podio, public as $$
declare
  v_row podio.webforms := coalesce(new, old);
  v_org uuid;
  v_ws uuid;
begin
  select a.workspace_id, w.organization_id into v_ws, v_org
  from podio.apps a join podio.workspaces w on w.id = a.workspace_id
  where a.id = v_row.app_id;
  perform podio.emit_webhook_event(v_org, v_ws, v_row.app_id, null,
    case tg_op when 'INSERT' then 'form.create'
               when 'UPDATE' then 'form.update'
               else 'form.delete' end,
    'form', v_row.id,
    jsonb_build_object('form_id', v_row.id, 'slug', v_row.slug,
      'title', v_row.title, 'is_active', v_row.is_active));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_hook_webform_events on podio.webforms;
create trigger trg_hook_webform_events after insert or update or delete on podio.webforms
for each row execute function podio.tg_hook_webform_events();

-- member.add / member.remove (workspace_members) — fires SPACE-level hooks
create or replace function podio.tg_hook_ws_member_events() returns trigger
language plpgsql security definer set search_path = podio, public as $$
declare
  v_row podio.workspace_members := coalesce(new, old);
  v_org uuid;
begin
  select organization_id into v_org from podio.workspaces where id = v_row.workspace_id;
  perform podio.emit_webhook_event(v_org, v_row.workspace_id, null, null,
    case when tg_op = 'DELETE' then 'member.remove' else 'member.add' end,
    'workspace_member', v_row.id,
    jsonb_build_object('user_id', v_row.user_id, 'workspace_id', v_row.workspace_id,
      'role', v_row.role));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_hook_ws_member_add on podio.workspace_members;
create trigger trg_hook_ws_member_add after insert on podio.workspace_members
for each row execute function podio.tg_hook_ws_member_events();

drop trigger if exists trg_hook_ws_member_remove on podio.workspace_members;
create trigger trg_hook_ws_member_remove after delete on podio.workspace_members
for each row execute function podio.tg_hook_ws_member_events();

-- 4) hooks_api: public-API entry point for hook management.
--    Same key-hash validation / rate-limit / write-scope pattern as api_request
--    (which is left untouched).
create or replace function podio.hooks_api(p_key_hash text, p_action text, p_params jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_key podio.api_keys;
  v_org uuid;
  v_hook podio.webhooks;
  v_app podio.apps;
  v_ws podio.workspaces;
  v_field podio.app_fields;
  v_url text;
  v_event text;
  v_limit int := least(coalesce((p_params->>'limit')::int, 50), 50);
  v_result jsonb;
begin
  select * into v_key from podio.api_keys
  where key_hash = p_key_hash and revoked_at is null;
  if v_key.id is null then
    raise exception 'invalid api key';
  end if;
  perform podio.check_rate_limit(v_key);
  update podio.api_keys set last_used_at = now() where id = v_key.id;
  v_org := v_key.organization_id;

  if p_action in ('hook.create','hook.delete','hook.verify.request','hook.verify.validate')
     and not ('write' = any(v_key.scopes)) then
    raise exception 'api key lacks write scope';
  end if;

  if p_action = 'hook.list' then
    if nullif(p_params->>'app_id','') is null and nullif(p_params->>'workspace_id','') is null then
      raise exception 'app_id or workspace_id required';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id, 'url', w.url, 'events', to_jsonb(w.events),
      'status', case when w.is_verified then 'active' else 'unverified' end,
      'is_active', w.is_active,
      'app_id', w.app_id, 'workspace_id', w.workspace_id, 'field_id', w.field_id,
      'created_at', w.created_at) order by w.created_at desc), '[]'::jsonb)
    into v_result
    from podio.webhooks w
    where w.organization_id = v_org
      and (nullif(p_params->>'app_id','') is null
           or w.app_id = (p_params->>'app_id')::uuid)
      and (nullif(p_params->>'workspace_id','') is null
           or w.workspace_id = (p_params->>'workspace_id')::uuid);
    return jsonb_build_object('data', v_result);

  elsif p_action = 'hook.create' then
    v_url := nullif(trim(coalesce(p_params->>'url','')), '');
    v_event := nullif(trim(coalesce(p_params->>'event','')), '');
    if v_url is null or v_url !~* '^https?://' then
      raise exception 'valid http(s) url required';
    end if;
    if v_event is null then
      raise exception 'event required';
    end if;

    if nullif(p_params->>'app_id','') is not null then
      select a.* into v_app from podio.apps a
      join podio.workspaces w on w.id = a.workspace_id
      where a.id = (p_params->>'app_id')::uuid and w.organization_id = v_org;
      if v_app.id is null then raise exception 'app not found'; end if;
    elsif nullif(p_params->>'workspace_id','') is not null then
      select w.* into v_ws from podio.workspaces w
      where w.id = (p_params->>'workspace_id')::uuid and w.organization_id = v_org;
      if v_ws.id is null then raise exception 'workspace not found'; end if;
    else
      raise exception 'app_id or workspace_id required';
    end if;

    if nullif(p_params->>'field_id','') is not null then
      if v_app.id is null then raise exception 'field_id requires app_id'; end if;
      select f.* into v_field from podio.app_fields f
      where f.id = (p_params->>'field_id')::uuid
        and f.app_id = v_app.id and f.status = 'active';
      if v_field.id is null then raise exception 'field not found on app'; end if;
    end if;

    insert into podio.webhooks
      (organization_id, app_id, workspace_id, field_id, url, events, secret, created_by)
    values
      (v_org, v_app.id, v_ws.id, v_field.id, v_url, array[v_event],
       replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
       v_key.created_by)
    returning * into v_hook;
    -- migration 36 triggers already generated verify_token and queued the
    -- hook.verify delivery (containing the code) to the target url
    return jsonb_build_object('data', jsonb_build_object(
      'id', v_hook.id, 'url', v_hook.url, 'events', to_jsonb(v_hook.events),
      'status', 'unverified',
      'app_id', v_hook.app_id, 'workspace_id', v_hook.workspace_id,
      'field_id', v_hook.field_id, 'created_at', v_hook.created_at));

  elsif p_action = 'hook.delete' then
    delete from podio.webhooks
    where id = (p_params->>'id')::uuid and organization_id = v_org
    returning * into v_hook;
    if v_hook.id is null then raise exception 'hook not found'; end if;
    return jsonb_build_object('data', jsonb_build_object('deleted', true, 'id', v_hook.id));

  elsif p_action = 'hook.verify.request' then
    select * into v_hook from podio.webhooks
    where id = (p_params->>'id')::uuid and organization_id = v_org;
    if v_hook.id is null then raise exception 'hook not found'; end if;
    if v_hook.is_verified then raise exception 'hook already verified'; end if;
    if v_hook.verify_token is null then
      update podio.webhooks set verify_token = replace(gen_random_uuid()::text, '-', '')
      where id = v_hook.id returning * into v_hook;
    end if;
    insert into podio.webhook_deliveries (webhook_id, event_type, payload, status)
    values (v_hook.id, 'hook.verify',
      jsonb_build_object('event', 'hook.verify', 'verify_token', v_hook.verify_token,
        'instructions', 'POST {"code": <verify_token>} to /api/v1/hooks/' || v_hook.id
          || '/verify/validate to activate the webhook',
        'occurred_at', now()),
      'pending');
    return jsonb_build_object('data', jsonb_build_object(
      'id', v_hook.id, 'status', 'unverified', 'verification_sent', true));

  elsif p_action = 'hook.verify.validate' then
    select * into v_hook from podio.webhooks
    where id = (p_params->>'id')::uuid and organization_id = v_org;
    if v_hook.id is null then raise exception 'hook not found'; end if;
    if v_hook.is_verified then
      return jsonb_build_object('data', jsonb_build_object(
        'id', v_hook.id, 'status', 'active', 'already_verified', true));
    end if;
    if v_hook.verify_token is null
       or nullif(p_params->>'code','') is distinct from v_hook.verify_token then
      raise exception 'invalid verification code';
    end if;
    update podio.webhooks set is_verified = true where id = v_hook.id;
    return jsonb_build_object('data', jsonb_build_object('id', v_hook.id, 'status', 'active'));

  elsif p_action = 'hook.deliveries' then
    select * into v_hook from podio.webhooks
    where id = (p_params->>'id')::uuid and organization_id = v_org;
    if v_hook.id is null then raise exception 'hook not found'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'event', d.event_type, 'status', d.status,
      'attempt', d.attempts, 'response_code', d.response_status,
      'created_at', d.created_at, 'delivered_at', d.delivered_at,
      'next_retry_at', d.next_retry_at)), '[]'::jsonb)
    into v_result
    from (select * from podio.webhook_deliveries
          where webhook_id = v_hook.id
          order by created_at desc limit v_limit) d;
    return jsonb_build_object('data', v_result);

  else
    raise exception 'unknown action: %', p_action;
  end if;
end $$;
grant execute on function podio.hooks_api(text, text, jsonb) to anon, authenticated;
