-- Podio Clone: Migration 16 - Dashboard tiles, guest sharing, app templates

-- Dashboard tiles (per workspace)
create table podio.dashboard_tiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references podio.workspaces(id) on delete cascade,
  app_id uuid not null references podio.apps(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('count','sum','avg','grouped')),
  config jsonb not null default '{}'::jsonb, -- {number_field_id, group_field_id}
  position int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table podio.dashboard_tiles enable row level security;
create policy p_dashboard_tiles_all on podio.dashboard_tiles for all to authenticated
  using (podio.is_workspace_member(workspace_id))
  with check (podio.is_workspace_member(workspace_id));
grant select, insert, update, delete on podio.dashboard_tiles to authenticated;
grant all on podio.dashboard_tiles to service_role;

-- Share a single item with an outside person by email
create or replace function podio.share_item(p_item uuid, p_email text, p_access podio.share_access default 'view')
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_user uuid;
  v_title text;
begin
  if not podio.is_workspace_member(podio.item_workspace(p_item)) then
    raise exception 'not a workspace member';
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  select title into v_title from podio.items where id = p_item;

  insert into podio.item_shares (item_id, user_id, email, access, invited_by)
  values (p_item, v_user, lower(trim(p_email)), p_access, auth.uid());

  if v_user is not null then
    insert into podio.notifications (user_id, event_type, target_type, target_id, actor_id, payload)
    values (v_user, 'item_shared', 'item', p_item, auth.uid(),
      jsonb_build_object('item_title', v_title, 'access', p_access));
  end if;

  return jsonb_build_object('shared', true, 'registered_user', v_user is not null);
end $$;
grant execute on function podio.share_item(uuid, text, podio.share_access) to authenticated;

-- Save an app's structure as a reusable template
create or replace function podio.save_app_template(
  p_app uuid, p_name text, p_description text default null,
  p_category text default null, p_visibility text default 'org'
)
returns uuid
language plpgsql security definer set search_path = podio, public as $$
declare
  v_app podio.apps;
  v_org uuid;
  v_def jsonb;
  v_id uuid;
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

  insert into podio.app_templates
    (organization_id, name, description, category, definition, source_app_id, visibility, created_by)
  values
    (v_org, p_name, p_description, p_category, v_def, p_app,
     case when p_visibility in ('private','org','public') then p_visibility else 'org' end,
     auth.uid())
  returning id into v_id;
  return v_id;
end $$;
grant execute on function podio.save_app_template(uuid, text, text, text, text) to authenticated;

-- Install a template into a workspace (structure only; saved-view filters are
-- stripped because they reference source-app field ids)
create or replace function podio.install_app_template(p_template uuid, p_workspace uuid)
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

  update podio.app_templates set install_count = install_count + 1 where id = p_template;
  insert into podio.template_installs (template_id, workspace_id, app_id, installed_by)
  values (p_template, p_workspace, v_app.id, auth.uid());

  return jsonb_build_object('app_id', v_app.id, 'slug', v_app.slug);
end $$;
grant execute on function podio.install_app_template(uuid, uuid) to authenticated;
