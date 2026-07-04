-- Podio Clone: Migration 36 - Phase 12b: webform depth, API v1.1, marketplace depth

-- Part 1: webform depth — get_webform returns theme/redirect/prefill metadata
create or replace function podio.get_webform(p_slug text)
returns jsonb
language sql stable security definer set search_path = podio, public as $$
  select jsonb_build_object(
    'slug', f.slug,
    'title', f.title,
    'description', f.description,
    'success_message', coalesce(f.settings->>'success_message', 'Thank you! Your submission was received.'),
    'redirect_url', f.settings->>'redirect_url',
    'theme', coalesce(f.settings->'theme', '{}'::jsonb),
    'custom_css', f.settings->>'custom_css',
    'app_name', a.name,
    'icon', a.icon,
    'item_name', a.item_name,
    'fields', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', af.id, 'external_id', af.external_id, 'label', af.label, 'type', af.type,
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

-- Part 2: API v1.1 — per-key rate limiting, webhook verification handshake,
-- workspace & task endpoints

-- Rate limiting: fixed one-minute windows per key
alter table podio.api_keys
  add column if not exists rate_limit_per_minute int not null default 60;

create table if not exists podio.api_key_usage (
  key_id uuid not null references podio.api_keys(id) on delete cascade,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key_id, window_start)
);
alter table podio.api_key_usage enable row level security;
grant all on podio.api_key_usage to service_role;

create or replace function podio.check_rate_limit(p_key podio.api_keys)
returns void
language plpgsql security definer set search_path = podio, public as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count int;
begin
  insert into podio.api_key_usage (key_id, window_start, count)
  values (p_key.id, v_window, 1)
  on conflict (key_id, window_start) do update
    set count = podio.api_key_usage.count + 1
  returning count into v_count;

  -- opportunistic cleanup of old windows (cheap: only this key)
  delete from podio.api_key_usage
  where key_id = p_key.id and window_start < now() - interval '10 minutes';

  if v_count > p_key.rate_limit_per_minute then
    raise exception 'rate limit exceeded: % requests/minute', p_key.rate_limit_per_minute;
  end if;
end $$;

-- Webhook verification handshake:
-- on webhook creation a 'hook.verify' delivery is queued automatically; the
-- receiving endpoint proves ownership by POSTing the verify_token back to
-- /api/v1/webhooks/verify, which calls verify_webhook().
create or replace function podio.tg_webhook_created()
returns trigger
language plpgsql security definer set search_path = podio, public as $$
begin
  if new.verify_token is null then
    new.verify_token := replace(gen_random_uuid()::text, '-', '');
  end if;
  return new;
end $$;

drop trigger if exists trg_webhooks_verify_token on podio.webhooks;
create trigger trg_webhooks_verify_token
before insert on podio.webhooks
for each row execute function podio.tg_webhook_created();

create or replace function podio.tg_webhook_send_verify()
returns trigger
language plpgsql security definer set search_path = podio, public as $$
begin
  insert into podio.webhook_deliveries (webhook_id, event_type, payload, status)
  values (new.id, 'hook.verify',
    jsonb_build_object('event', 'hook.verify', 'verify_token', new.verify_token,
      'instructions', 'POST this verify_token to /api/v1/webhooks/verify to activate the webhook',
      'occurred_at', now()),
    'pending');
  return new;
end $$;

drop trigger if exists trg_webhooks_send_verify on podio.webhooks;
create trigger trg_webhooks_send_verify
after insert on podio.webhooks
for each row execute function podio.tg_webhook_send_verify();

create or replace function podio.verify_webhook(p_token text)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_hook podio.webhooks;
begin
  select * into v_hook from podio.webhooks
  where verify_token = p_token and not is_verified;
  if v_hook.id is null then
    raise exception 'invalid or already-used verify token';
  end if;
  update podio.webhooks set is_verified = true where id = v_hook.id;
  return jsonb_build_object('verified', true, 'webhook_id', v_hook.id);
end $$;
grant execute on function podio.verify_webhook(text) to anon, authenticated;

-- api_request v1.1: rate limiting + workspace/task actions
create or replace function podio.api_request(p_key_hash text, p_action text, p_params jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_key podio.api_keys;
  v_org uuid;
  v_app podio.apps;
  v_item podio.items;
  v_task podio.tasks;
  v_values jsonb;
  v_limit int := least(coalesce((p_params->>'limit')::int, 50), 200);
  v_offset int := coalesce((p_params->>'offset')::int, 0);
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

  if p_action in ('create_item','update_item','delete_item','create_task','complete_task')
     and not ('write' = any(v_key.scopes)) then
    raise exception 'api key lacks write scope';
  end if;

  if p_action = 'list_apps' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'slug', a.slug, 'item_name', a.item_name,
      'workspace', w.name,
      'fields', (select coalesce(jsonb_agg(jsonb_build_object(
          'external_id', f.external_id, 'label', f.label, 'type', f.type)
          order by f.position), '[]'::jsonb)
        from podio.app_fields f where f.app_id = a.id and f.status = 'active')
    )), '[]'::jsonb) into v_result
    from podio.apps a
    join podio.workspaces w on w.id = a.workspace_id
    where w.organization_id = v_org and not a.is_archived;
    return jsonb_build_object('data', v_result);

  elsif p_action = 'list_workspaces' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id, 'name', w.name, 'slug', w.slug, 'privacy', w.privacy,
      'created_at', w.created_at,
      'app_count', (select count(*) from podio.apps a
        where a.workspace_id = w.id and not a.is_archived)
    ) order by w.created_at), '[]'::jsonb) into v_result
    from podio.workspaces w
    where w.organization_id = v_org and not w.is_archived;
    return jsonb_build_object('data', v_result);

  elsif p_action = 'list_tasks' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'title', t.title, 'description', t.description,
      'status', t.status, 'due_at', t.due_at, 'completed_at', t.completed_at,
      'assignee_id', t.assignee_id, 'target_type', t.target_type, 'target_id', t.target_id,
      'created_at', t.created_at
    )), '[]'::jsonb) into v_result
    from (select * from podio.tasks
          where organization_id = v_org
            and (nullif(p_params->>'status','') is null or status = p_params->>'status')
          order by created_at desc limit v_limit offset v_offset) t;
    return jsonb_build_object('data', v_result, 'limit', v_limit, 'offset', v_offset);

  elsif p_action = 'create_task' then
    if v_key.created_by is null then
      raise exception 'api key has no owning user; cannot create tasks';
    end if;
    insert into podio.tasks (organization_id, workspace_id, title, description, assignee_id, due_at, created_by)
    values (
      v_org,
      nullif(p_params->>'workspace_id','')::uuid,
      coalesce(nullif(p_params->>'title',''), 'API task'),
      p_params->>'description',
      nullif(p_params->>'assignee_id','')::uuid,
      nullif(p_params->>'due_at','')::timestamptz,
      v_key.created_by
    ) returning * into v_task;
    return jsonb_build_object('data', jsonb_build_object(
      'id', v_task.id, 'title', v_task.title, 'status', v_task.status,
      'due_at', v_task.due_at, 'created_at', v_task.created_at));

  elsif p_action = 'complete_task' then
    update podio.tasks
    set status = 'completed', completed_at = now(), completed_by = v_key.created_by
    where id = (p_params->>'task_id')::uuid and organization_id = v_org
      and completed_at is null
    returning * into v_task;
    if v_task.id is null then raise exception 'task not found or already completed'; end if;
    return jsonb_build_object('data', jsonb_build_object(
      'id', v_task.id, 'status', v_task.status, 'completed_at', v_task.completed_at));

  elsif p_action = 'list_items' then
    select a.* into v_app from podio.apps a
    join podio.workspaces w on w.id = a.workspace_id
    where a.id = (p_params->>'app_id')::uuid and w.organization_id = v_org;
    if v_app.id is null then raise exception 'app not found'; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'item_number', i.item_number, 'title', i.title,
      'created_at', i.created_at, 'updated_at', i.updated_at,
      'values', (select coalesce(jsonb_object_agg(af.external_id, ifv.value), '{}'::jsonb)
        from podio.item_field_values ifv
        join podio.app_fields af on af.id = ifv.field_id
        where ifv.item_id = i.id)
    )), '[]'::jsonb) into v_result
    from (select * from podio.items
          where app_id = v_app.id and not is_deleted
          order by created_at desc limit v_limit offset v_offset) i;
    return jsonb_build_object('data', v_result, 'limit', v_limit, 'offset', v_offset);

  elsif p_action in ('get_item','update_item','delete_item') then
    select i.* into v_item from podio.items i
    join podio.apps a on a.id = i.app_id
    join podio.workspaces w on w.id = a.workspace_id
    where i.id = (p_params->>'item_id')::uuid
      and w.organization_id = v_org and not i.is_deleted;
    if v_item.id is null then raise exception 'item not found'; end if;

    if p_action = 'delete_item' then
      update podio.items set is_deleted = true, deleted_at = now() where id = v_item.id;
      return jsonb_build_object('data', jsonb_build_object('deleted', true, 'id', v_item.id));
    end if;

    if p_action = 'update_item' then
      select coalesce(jsonb_object_agg(af.id::text, p_params->'values'->af.external_id), '{}'::jsonb)
        into v_values
      from podio.app_fields af
      where af.app_id = v_item.app_id and af.status = 'active'
        and p_params->'values' ? af.external_id;
      perform podio.write_values(v_item.app_id, v_item.id, v_values, null);
      update podio.items set updated_at = now() where id = v_item.id;
    end if;

    select jsonb_build_object(
      'id', i.id, 'item_number', i.item_number, 'title', i.title,
      'created_at', i.created_at, 'updated_at', i.updated_at,
      'values', (select coalesce(jsonb_object_agg(af.external_id, ifv.value), '{}'::jsonb)
        from podio.item_field_values ifv
        join podio.app_fields af on af.id = ifv.field_id
        where ifv.item_id = i.id)
    ) into v_result
    from podio.items i where i.id = v_item.id;
    return jsonb_build_object('data', v_result);

  elsif p_action = 'create_item' then
    select a.* into v_app from podio.apps a
    join podio.workspaces w on w.id = a.workspace_id
    where a.id = (p_params->>'app_id')::uuid and w.organization_id = v_org;
    if v_app.id is null then raise exception 'app not found'; end if;

    insert into podio.items (app_id) values (v_app.id) returning * into v_item;

    select coalesce(jsonb_object_agg(af.id::text, p_params->'values'->af.external_id), '{}'::jsonb)
      into v_values
    from podio.app_fields af
    where af.app_id = v_app.id and af.status = 'active'
      and p_params->'values' ? af.external_id;
    perform podio.write_values(v_app.id, v_item.id, v_values, null);

    insert into podio.activity_events
      (organization_id, workspace_id, app_id, item_id, event_type, target_type, target_id, payload)
    values
      (v_org, v_app.workspace_id, v_app.id, v_item.id, 'item_created', 'item', v_item.id,
       jsonb_build_object('via', 'api', 'api_key', v_key.name));

    perform podio.run_simple_automations(v_app.id, v_item.id, 'item_created', null);

    select jsonb_build_object(
      'id', i.id, 'item_number', i.item_number, 'title', i.title, 'created_at', i.created_at,
      'values', (select coalesce(jsonb_object_agg(af.external_id, ifv.value), '{}'::jsonb)
        from podio.item_field_values ifv
        join podio.app_fields af on af.id = ifv.field_id
        where ifv.item_id = i.id)
    ) into v_result
    from podio.items i where i.id = v_item.id;
    return jsonb_build_object('data', v_result);

  else
    raise exception 'unknown action: %', p_action;
  end if;
end $$;
grant execute on function podio.api_request(text, text, jsonb) to anon, authenticated;

-- Part 3: marketplace depth — sample data, versioning, reviews, publishing

-- save_app_template v2: optional sample capture + version bump on re-save
drop function if exists podio.save_app_template(uuid, text, text, text, text);
create or replace function podio.save_app_template(
  p_app uuid, p_name text, p_description text default null,
  p_category text default null, p_visibility text default 'org',
  p_include_samples boolean default false
)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_app podio.apps;
  v_org uuid;
  v_def jsonb;
  v_existing podio.app_templates;
  v_id uuid;
  v_version int := 1;
begin
  select * into v_app from podio.apps where id = p_app;
  if v_app.id is null or not podio.is_workspace_member(v_app.workspace_id) then
    raise exception 'no access to app';
  end if;
  select organization_id into v_org from podio.workspaces where id = v_app.workspace_id;

  v_def := jsonb_build_object(
    'app', jsonb_build_object(
      'name', v_app.name, 'icon', v_app.icon, 'item_name', v_app.item_name,
      'description', v_app.description, 'usage_instructions', v_app.usage_instructions),
    'fields', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'external_id', f.external_id, 'label', f.label, 'type', f.type,
        'help_text', f.help_text, 'is_required', f.is_required,
        'is_primary', f.is_primary, 'position', f.position, 'config', f.config
      ) order by f.position), '[]'::jsonb)
      from podio.app_fields f where f.app_id = p_app and f.status = 'active'),
    'views', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', v.name, 'layout', v.layout, 'filters', v.filters, 'sort', v.sort,
        'group_by', v.group_by, 'columns', v.columns, 'settings', v.settings,
        'is_default', v.is_default, 'position', v.position
      ) order by v.position), '[]'::jsonb)
      from podio.app_views v where v.app_id = p_app and v.visibility = 'team')
  );

  if p_include_samples then
    v_def := v_def || jsonb_build_object('sample_items', (
      select coalesce(jsonb_agg(jsonb_build_object('title', s.title, 'values', s.vals)), '[]'::jsonb)
      from (
        select i.title,
          (select coalesce(jsonb_object_agg(af.external_id, ifv.value), '{}'::jsonb)
           from podio.item_field_values ifv
           join podio.app_fields af on af.id = ifv.field_id
           where ifv.item_id = i.id and af.status = 'active'
             and af.type not in ('relationship','contact','image','file','calculation')) as vals
        from podio.items i
        where i.app_id = p_app and not i.is_deleted
        order by i.created_at desc
        limit 5
      ) s
    ));
  end if;

  -- Versioning: re-saving the same app under the same template name bumps the version
  select * into v_existing from podio.app_templates
  where organization_id = v_org and source_app_id = p_app and name = p_name;

  if v_existing.id is not null then
    v_version := v_existing.version + 1;
    update podio.app_templates
    set definition = v_def, description = coalesce(p_description, description),
        category = coalesce(p_category, category), version = v_version,
        visibility = case when p_visibility in ('private','org','public') then p_visibility else visibility end
    where id = v_existing.id;
    v_id := v_existing.id;
  else
    insert into podio.app_templates
      (organization_id, name, description, category, definition, source_app_id, visibility, created_by)
    values
      (v_org, p_name, p_description, p_category, v_def, p_app,
       case when p_visibility in ('private','org','public') then p_visibility else 'org' end,
       auth.uid())
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id, 'version', v_version,
    'sample_count', coalesce(jsonb_array_length(v_def->'sample_items'), 0));
end $$;
grant execute on function podio.save_app_template(uuid, text, text, text, text, boolean) to authenticated;

-- install_app_template v2: optional sample data
drop function if exists podio.install_app_template(uuid, uuid);
create or replace function podio.install_app_template(
  p_template uuid, p_workspace uuid, p_with_samples boolean default false
)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_tpl podio.app_templates;
  v_org uuid;
  v_app podio.apps;
  v_slug text;
  v_base text;
  v_i int := 1;
  v_f jsonb;
  v_v jsonb;
  v_s jsonb;
  v_item podio.items;
  v_values jsonb;
  v_samples int := 0;
begin
  select * into v_tpl from podio.app_templates where id = p_template;
  if v_tpl.id is null then
    raise exception 'template not found';
  end if;
  select organization_id into v_org from podio.workspaces where id = p_workspace;
  if not podio.is_workspace_member(p_workspace) then
    raise exception 'not a workspace member';
  end if;
  if v_tpl.visibility <> 'public' and (v_tpl.organization_id is distinct from v_org) then
    raise exception 'template not available to this organization';
  end if;

  v_base := lower(regexp_replace(v_tpl.definition->'app'->>'name', '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := v_base;
  while exists (select 1 from podio.apps where workspace_id = p_workspace and slug = v_slug) loop
    v_slug := v_base || '-' || v_i;
    v_i := v_i + 1;
  end loop;

  insert into podio.apps (workspace_id, name, slug, icon, item_name, description, usage_instructions, created_by)
  values (p_workspace,
    v_tpl.definition->'app'->>'name', v_slug,
    v_tpl.definition->'app'->>'icon',
    coalesce(v_tpl.definition->'app'->>'item_name', 'Item'),
    v_tpl.definition->'app'->>'description',
    v_tpl.definition->'app'->>'usage_instructions',
    auth.uid())
  returning * into v_app;

  for v_f in select * from jsonb_array_elements(v_tpl.definition->'fields') loop
    insert into podio.app_fields
      (app_id, external_id, label, type, help_text, is_required, is_primary, position, config)
    values
      (v_app.id, v_f->>'external_id', v_f->>'label', (v_f->>'type')::podio.field_type,
       v_f->>'help_text', coalesce((v_f->>'is_required')::boolean, false),
       coalesce((v_f->>'is_primary')::boolean, false),
       coalesce((v_f->>'position')::int, 0), coalesce(v_f->'config', '{}'::jsonb));
  end loop;

  for v_v in select * from jsonb_array_elements(v_tpl.definition->'views') loop
    insert into podio.app_views (app_id, name, layout, filters, sort, settings, is_default, position, visibility)
    values (v_app.id, v_v->>'name', (v_v->>'layout')::podio.view_layout,
      '[]'::jsonb, '[]'::jsonb, coalesce(v_v->'settings', '{}'::jsonb),
      coalesce((v_v->>'is_default')::boolean, false),
      coalesce((v_v->>'position')::int, 0), 'team');
  end loop;

  if p_with_samples then
    for v_s in select * from jsonb_array_elements(coalesce(v_tpl.definition->'sample_items', '[]'::jsonb)) loop
      insert into podio.items (app_id, title, created_by)
      values (v_app.id, v_s->>'title', auth.uid())
      returning * into v_item;

      select coalesce(jsonb_object_agg(af.id::text, v_s->'values'->af.external_id), '{}'::jsonb)
        into v_values
      from podio.app_fields af
      where af.app_id = v_app.id and af.status = 'active'
        and v_s->'values' ? af.external_id;

      perform podio.write_values(v_app.id, v_item.id, v_values, auth.uid());
      v_samples := v_samples + 1;
    end loop;
  end if;

  update podio.app_templates set install_count = install_count + 1 where id = p_template;
  insert into podio.template_installs (template_id, workspace_id, app_id, with_sample_data, installed_by)
  values (p_template, p_workspace, v_app.id, p_with_samples and v_samples > 0, auth.uid());

  return jsonb_build_object('app_id', v_app.id, 'slug', v_app.slug, 'sample_items', v_samples);
end $$;
grant execute on function podio.install_app_template(uuid, uuid, boolean) to authenticated;

-- Reviews: upsert + rating rollup
create or replace function podio.review_template(
  p_template uuid, p_rating int, p_review text default null
)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_tpl podio.app_templates;
  v_avg numeric;
  v_count int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_rating not between 1 and 5 then raise exception 'rating must be 1-5'; end if;
  select * into v_tpl from podio.app_templates where id = p_template;
  if v_tpl.id is null then raise exception 'template not found'; end if;

  insert into podio.template_reviews (template_id, user_id, rating, review)
  values (p_template, auth.uid(), p_rating, nullif(trim(coalesce(p_review,'')), ''))
  on conflict (template_id, user_id) do update
    set rating = excluded.rating, review = excluded.review, created_at = now();

  select round(avg(rating), 2), count(*) into v_avg, v_count
  from podio.template_reviews where template_id = p_template;

  update podio.app_templates set rating_avg = v_avg where id = p_template;
  return jsonb_build_object('rating_avg', v_avg, 'review_count', v_count);
end $$;
grant execute on function podio.review_template(uuid, int, text) to authenticated;

-- Publishing: org admins can make an org template public (or pull it back)
create or replace function podio.set_template_visibility(p_template uuid, p_visibility text)
returns void
language plpgsql security definer set search_path = podio, public as $$
declare
  v_tpl podio.app_templates;
begin
  if p_visibility not in ('private','org','public') then
    raise exception 'invalid visibility';
  end if;
  select * into v_tpl from podio.app_templates where id = p_template;
  if v_tpl.id is null then raise exception 'template not found'; end if;
  if v_tpl.organization_id is null or not podio.is_org_admin(v_tpl.organization_id) then
    raise exception 'only org admins can change template visibility';
  end if;
  update podio.app_templates set visibility = p_visibility where id = p_template;
end $$;
grant execute on function podio.set_template_visibility(uuid, text) to authenticated;
