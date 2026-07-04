-- Podio Clone: Migration 41 - Phase 14 differentiators:
-- white-label portal branding, web-push subscriptions + worker ping,
-- automations installed from template definitions (shared helper),
-- industry starter packs seeded into the public marketplace.
--
-- Push worker setup (optional; without it notifications simply aren't pushed):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/push-worker', 'push_worker_url');
--   select vault.create_secret('<random-long-token>', 'push_worker_token');
--   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com PUSH_WORKER_TOKEN=<same-token>

-- ============================================================
-- 1) White-label portal branding
--    organizations.branding = { "portal_enabled": bool, "accent": "#15808D",
--      "welcome": "text", "portal_title": "Client Portal" }
--    (logo_url column already exists on organizations)
-- ============================================================
alter table podio.organizations
  add column if not exists branding jsonb not null default '{}'::jsonb;

-- Pre-auth lookup for the public portal page.
create or replace function podio.portal_lookup(p_slug text)
returns jsonb
language sql stable security definer set search_path = podio, public as $$
  select jsonb_build_object(
    'name', o.name,
    'slug', o.slug,
    'logo_url', o.logo_url,
    'accent', coalesce(o.branding->>'accent', '#15808D'),
    'portal_title', coalesce(o.branding->>'portal_title', o.name || ' Portal'),
    'welcome', o.branding->>'welcome')
  from podio.organizations o
  where o.slug = lower(p_slug)
    and coalesce((o.branding->>'portal_enabled')::boolean, false);
$$;
grant execute on function podio.portal_lookup(text) to anon, authenticated;

-- Items shared with the signed-in user (guest portal content).
create or replace function podio.my_shared_items()
returns jsonb
language sql stable security definer set search_path = podio, public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id', i.id,
    'title', coalesce(i.title, '#' || i.item_number),
    'item_number', i.item_number,
    'access', s.access,
    'app_name', a.name,
    'app_icon', a.icon,
    'app_slug', a.slug,
    'ws_slug', w.slug,
    'org_slug', o.slug,
    'org_name', o.name,
    'shared_at', s.created_at) order by s.created_at desc), '[]'::jsonb)
  from podio.item_shares s
  join podio.items i on i.id = s.item_id and not i.is_deleted
  join podio.apps a on a.id = i.app_id
  join podio.workspaces w on w.id = a.workspace_id
  join podio.organizations o on o.id = w.organization_id
  where s.user_id = auth.uid() and s.revoked_at is null;
$$;
grant execute on function podio.my_shared_items() to authenticated;

-- ============================================================
-- 2) Web push subscriptions + delivery queue
-- ============================================================
create table if not exists podio.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null, -- { "p256dh": ..., "auth": ... }
  user_agent text,
  created_at timestamptz not null default now()
);
alter table podio.push_subscriptions enable row level security;
create policy p_push_subs_own on podio.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on podio.push_subscriptions to authenticated;
grant all on podio.push_subscriptions to service_role;
create index if not exists idx_push_subs_user on podio.push_subscriptions (user_id);

alter table podio.notifications add column if not exists pushed_at timestamptz;
create index if not exists idx_notifications_unpushed
  on podio.notifications (created_at) where pushed_at is null;

-- Cron ping: nudge the push-worker edge function only when there are
-- unpushed notifications belonging to users who actually have a subscription.
create or replace function podio.process_push_notifications()
returns int
language plpgsql security definer set search_path = podio, public as $$
declare
  v_url text;
  v_token text;
  v_n int;
begin
  select count(*) into v_n
  from podio.notifications n
  where n.pushed_at is null
    and n.created_at > now() - interval '1 day'
    and exists (select 1 from podio.push_subscriptions p where p.user_id = n.user_id);
  if v_n = 0 then
    return 0;
  end if;
  begin
    select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'push_worker_url' limit 1;
    select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'push_worker_token' limit 1;
  exception when others then
    v_url := null;
  end;
  if v_url is null or v_token is null then
    return 0;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-worker-token', v_token));
  return v_n;
end $$;
revoke execute on function podio.process_push_notifications() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('podio_send_push', '* * * * *',
    'select podio.process_push_notifications()');
exception when others then null;
end $$;

-- ============================================================
-- 3) Automations from template definitions (shared helper)
--    Previously only ai_install_app translated definition automations;
--    marketplace installs silently dropped them. Extracted here so both
--    paths behave the same.
-- ============================================================
create or replace function podio.install_definition_automations(
  p_workspace uuid, p_app uuid, p_definition jsonb
)
returns int
language plpgsql security definer set search_path = podio, public as $$
declare
  v_auto jsonb;
  v_cond jsonb;
  v_conds jsonb;
  v_act jsonb;
  v_acts jsonb;
  v_fid uuid;
  v_n int := 0;
begin
  for v_auto in select * from jsonb_array_elements(coalesce(p_definition->'automations','[]'::jsonb)) loop
    v_conds := '[]'::jsonb;
    for v_cond in select * from jsonb_array_elements(coalesce(v_auto->'conditions','[]'::jsonb)) loop
      select id into v_fid from podio.app_fields
      where app_id = p_app and external_id = v_cond->>'field_external_id' and status = 'active';
      if v_fid is not null then
        v_conds := v_conds || jsonb_build_array(
          (v_cond - 'field_external_id') || jsonb_build_object('field_id', v_fid));
      end if;
    end loop;

    v_acts := '[]'::jsonb;
    for v_act in select * from jsonb_array_elements(coalesce(v_auto->'actions','[]'::jsonb)) loop
      if v_act ? 'field_external_id' then
        select id into v_fid from podio.app_fields
        where app_id = p_app and external_id = v_act->>'field_external_id' and status = 'active';
        if v_fid is null then continue; end if;
        v_act := (v_act - 'field_external_id') || jsonb_build_object('field_id', v_fid);
      end if;
      v_acts := v_acts || jsonb_build_array(v_act);
    end loop;

    if jsonb_array_length(v_acts) > 0 then
      insert into podio.automations
        (workspace_id, app_id, name, kind, status, trigger, conditions, actions, created_by)
      values (p_workspace, p_app,
        coalesce(v_auto->>'name', 'Template automation'), 'simple', 'active',
        coalesce(v_auto->'trigger', '{"type":"item_created"}'::jsonb),
        v_conds, v_acts, auth.uid());
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function podio.install_definition_automations(uuid, uuid, jsonb) from public, anon, authenticated;

-- install_app_template v3: also installs definition automations.
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
  v_autos int := 0;
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

  v_autos := podio.install_definition_automations(p_workspace, v_app.id, v_tpl.definition);

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

  return jsonb_build_object('app_id', v_app.id, 'slug', v_app.slug,
    'sample_items', v_samples, 'automations_installed', v_autos);
end $$;
grant execute on function podio.install_app_template(uuid, uuid, boolean) to authenticated;

-- ai_install_app v2: the template install now handles automations; drop the
-- inline duplicate loop (it would double-install them).
create or replace function podio.ai_install_app(p_workspace uuid, p_definition jsonb)
returns jsonb
language plpgsql security definer set search_path = podio, public as $$
declare
  v_org uuid;
  v_tpl uuid;
  v_res jsonb;
begin
  if not podio.is_workspace_member(p_workspace) then
    raise exception 'not a workspace member';
  end if;
  if p_definition->'app'->>'name' is null or jsonb_typeof(p_definition->'fields') <> 'array' then
    raise exception 'definition must contain app.name and a fields array';
  end if;
  select organization_id into v_org from podio.workspaces where id = p_workspace;

  insert into podio.app_templates
    (organization_id, name, description, category, definition, visibility, created_by)
  values (v_org, coalesce(p_definition->'app'->>'name','AI app') || ' (AI generated)',
    'Generated by the AI app builder', p_definition->>'category',
    p_definition, 'private', auth.uid())
  returning id into v_tpl;

  v_res := podio.install_app_template(v_tpl, p_workspace, false);
  return v_res || jsonb_build_object('template_id', v_tpl);
end $$;
grant execute on function podio.ai_install_app(uuid, jsonb) to authenticated;

-- ============================================================
-- 4) Industry starter packs (platform templates: organization_id null,
--    visibility public). Idempotent by name.
-- ============================================================
do $$
declare
  v_defs jsonb := jsonb_build_array(
  jsonb_build_object(
    'name', 'Recruiting Pipeline',
    'category', 'recruiting',
    'description', 'Track candidates from application to hire, with screening tasks created automatically.',
    'definition', $j1${
      "app": {"name": "Recruiting Pipeline", "icon": "🧑‍💼", "item_name": "Candidate", "description": "Candidates moving through your hiring funnel."},
      "fields": [
        {"external_id": "candidate-name", "label": "Candidate", "type": "text", "is_primary": true, "is_required": true, "position": 0},
        {"external_id": "stage", "label": "Stage", "type": "category", "position": 1, "config": {"options": [
          {"id": "applied", "label": "Applied", "color": "#CFE8F7"},
          {"id": "phone-screen", "label": "Phone Screen", "color": "#F5EFC8"},
          {"id": "interview", "label": "Interview", "color": "#DCC8F5"},
          {"id": "offer", "label": "Offer", "color": "#FBE3C9"},
          {"id": "hired", "label": "Hired", "color": "#D9F2E5"}]}},
        {"external_id": "role", "label": "Role", "type": "text", "position": 2},
        {"external_id": "email", "label": "Email", "type": "email", "position": 3},
        {"external_id": "phone", "label": "Phone", "type": "phone", "position": 4},
        {"external_id": "applied-date", "label": "Applied", "type": "date", "position": 5}
      ],
      "views": [
        {"name": "All candidates", "layout": "table", "is_default": true, "position": 0},
        {"name": "Pipeline", "layout": "kanban", "position": 1},
        {"name": "Cards", "layout": "card", "position": 2}
      ],
      "automations": [
        {"name": "Schedule phone screen", "trigger": {"type": "item_created"},
         "actions": [{"type": "create_task", "title": "Schedule phone screen", "due_days": 2}]},
        {"name": "Offer follow-up", "trigger": {"type": "item_updated"},
         "conditions": [{"field_external_id": "stage", "op": "equals", "value": "offer"}],
         "actions": [{"type": "add_comment", "body": "Offer stage reached — send offer letter and set a decision deadline."}]}
      ],
      "sample_items": [
        {"title": "Jordan Alvarez", "values": {"candidate-name": "Jordan Alvarez", "stage": "interview", "role": "Frontend Engineer", "email": "jordan@example.com"}},
        {"title": "Sam Whitfield", "values": {"candidate-name": "Sam Whitfield", "stage": "applied", "role": "Account Manager"}},
        {"title": "Priya Nair", "values": {"candidate-name": "Priya Nair", "stage": "offer", "role": "Data Analyst"}}
      ]
    }$j1$::jsonb),
  jsonb_build_object(
    'name', 'Client Onboarding',
    'category', 'client_onboarding',
    'description', 'A standard client onboarding runway: kickoff, data collection, setup, live.',
    'definition', $j2${
      "app": {"name": "Client Onboarding", "icon": "🚀", "item_name": "Client", "description": "New clients moving through onboarding."},
      "fields": [
        {"external_id": "client-name", "label": "Client", "type": "text", "is_primary": true, "is_required": true, "position": 0},
        {"external_id": "status", "label": "Status", "type": "category", "position": 1, "config": {"options": [
          {"id": "kickoff", "label": "Kickoff", "color": "#CFE8F7"},
          {"id": "data-collection", "label": "Data Collection", "color": "#F5EFC8"},
          {"id": "setup", "label": "Setup", "color": "#DCC8F5"},
          {"id": "live", "label": "Live", "color": "#D9F2E5"}]}},
        {"external_id": "contact-email", "label": "Contact email", "type": "email", "position": 2},
        {"external_id": "start-date", "label": "Start date", "type": "date", "position": 3},
        {"external_id": "notes", "label": "Notes", "type": "text", "position": 4}
      ],
      "views": [
        {"name": "All clients", "layout": "table", "is_default": true, "position": 0},
        {"name": "Runway", "layout": "kanban", "position": 1}
      ],
      "automations": [
        {"name": "Welcome packet", "trigger": {"type": "item_created"},
         "actions": [{"type": "create_task", "title": "Send welcome packet", "due_days": 1},
                     {"type": "add_comment", "body": "Onboarding started — kickoff call within 3 business days."}]}
      ],
      "sample_items": [
        {"title": "Acme Industries", "values": {"client-name": "Acme Industries", "status": "setup", "contact-email": "ops@acme.example"}},
        {"title": "Bluebird Dental", "values": {"client-name": "Bluebird Dental", "status": "kickoff"}}
      ]
    }$j2$::jsonb),
  jsonb_build_object(
    'name', 'Field Service Jobs',
    'category', 'field_service',
    'description', 'Dispatch and track on-site jobs with appointment confirmation tasks.',
    'definition', $j3${
      "app": {"name": "Field Service Jobs", "icon": "🛠️", "item_name": "Job", "description": "Scheduled field work and its status."},
      "fields": [
        {"external_id": "job-title", "label": "Job", "type": "text", "is_primary": true, "is_required": true, "position": 0},
        {"external_id": "status", "label": "Status", "type": "category", "position": 1, "config": {"options": [
          {"id": "scheduled", "label": "Scheduled", "color": "#CFE8F7"},
          {"id": "en-route", "label": "En Route", "color": "#F5EFC8"},
          {"id": "on-site", "label": "On Site", "color": "#FBE3C9"},
          {"id": "complete", "label": "Complete", "color": "#D9F2E5"}]}},
        {"external_id": "scheduled-for", "label": "Scheduled for", "type": "date", "position": 2},
        {"external_id": "technician", "label": "Technician", "type": "text", "position": 3},
        {"external_id": "site-address", "label": "Site address", "type": "location", "position": 4}
      ],
      "views": [
        {"name": "All jobs", "layout": "table", "is_default": true, "position": 0},
        {"name": "Board", "layout": "kanban", "position": 1},
        {"name": "Schedule", "layout": "calendar", "position": 2}
      ],
      "automations": [
        {"name": "Confirm appointment", "trigger": {"type": "item_created"},
         "actions": [{"type": "create_task", "title": "Confirm appointment with customer", "due_days": 1}]}
      ],
      "sample_items": [
        {"title": "HVAC tune-up — Maple St", "values": {"job-title": "HVAC tune-up — Maple St", "status": "scheduled", "technician": "R. Ortiz"}},
        {"title": "Panel inspection — Dockside", "values": {"job-title": "Panel inspection — Dockside", "status": "on-site", "technician": "M. Chen"}}
      ]
    }$j3$::jsonb),
  jsonb_build_object(
    'name', 'Purchase Approvals',
    'category', 'accounting',
    'description', 'Approval-flow template: purchase requests with review tasks and status-driven follow-ups. Pair with an advanced flow for hard approval gates.',
    'definition', $j4${
      "app": {"name": "Purchase Approvals", "icon": "✅", "item_name": "Request", "description": "Purchase requests awaiting review."},
      "fields": [
        {"external_id": "request-title", "label": "Request", "type": "text", "is_primary": true, "is_required": true, "position": 0},
        {"external_id": "status", "label": "Status", "type": "category", "position": 1, "config": {"options": [
          {"id": "draft", "label": "Draft", "color": "#ECECEC"},
          {"id": "submitted", "label": "Submitted", "color": "#F5EFC8"},
          {"id": "approved", "label": "Approved", "color": "#D9F2E5"},
          {"id": "rejected", "label": "Rejected", "color": "#F9D7D4"}]}},
        {"external_id": "amount", "label": "Amount", "type": "money", "position": 2},
        {"external_id": "requested-by", "label": "Requested by", "type": "text", "position": 3},
        {"external_id": "needed-by", "label": "Needed by", "type": "date", "position": 4}
      ],
      "views": [
        {"name": "All requests", "layout": "table", "is_default": true, "position": 0},
        {"name": "By status", "layout": "kanban", "position": 1}
      ],
      "automations": [
        {"name": "Review request", "trigger": {"type": "item_updated"},
         "conditions": [{"field_external_id": "status", "op": "equals", "value": "submitted"}],
         "actions": [{"type": "create_task", "title": "Review purchase request", "due_days": 2}]},
        {"name": "Approved follow-up", "trigger": {"type": "item_updated"},
         "conditions": [{"field_external_id": "status", "op": "equals", "value": "approved"}],
         "actions": [{"type": "add_comment", "body": "Approved — raise the PO and notify the requester."}]}
      ],
      "sample_items": [
        {"title": "Standing desks (x4)", "values": {"request-title": "Standing desks (x4)", "status": "submitted", "requested-by": "B. Sharma"}},
        {"title": "Conference sponsorship", "values": {"request-title": "Conference sponsorship", "status": "draft", "requested-by": "F. Delgado"}}
      ]
    }$j4$::jsonb)
  );
  v jsonb;
begin
  for v in select * from jsonb_array_elements(v_defs) loop
    if not exists (
      select 1 from podio.app_templates
      where organization_id is null and name = v->>'name'
    ) then
      insert into podio.app_templates
        (organization_id, name, description, category, definition, visibility)
      values (null, v->>'name', v->>'description', v->>'category', v->'definition', 'public');
    end if;
  end loop;
end $$;
