-- Podio Clone: Migration 4 - External intake (webforms, email-to-app) and workflow automation

-- Webforms: public form per app
create table podio.webforms (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references podio.apps(id) on delete cascade,
  slug text not null unique,
  title text not null,
  description text,
  field_ids uuid[] not null default '{}',
  settings jsonb not null default '{}'::jsonb, -- theme, custom_css, redirect_url, success_message, captcha, allowed_domains
  require_email boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_webforms_app on podio.webforms (app_id);
create trigger trg_webforms_updated before update on podio.webforms
for each row execute function podio.set_updated_at();

-- Submission audit trail (item creation handled by an Edge Function with service role)
create table podio.webform_submissions (
  id uuid primary key default gen_random_uuid(),
  webform_id uuid not null references podio.webforms(id) on delete cascade,
  item_id uuid references podio.items(id) on delete set null,
  submitter_email text,
  submitter_name text,
  payload jsonb not null,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_webform_subs_form on podio.webform_submissions (webform_id, created_at desc);

-- Email-to-app: unique inbound address per app + parsed inbound mail log
create table podio.app_email_addresses (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references podio.apps(id) on delete cascade,
  address text not null unique,
  field_mapping jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table podio.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  app_email_id uuid not null references podio.app_email_addresses(id) on delete cascade,
  item_id uuid references podio.items(id) on delete set null,
  from_address text not null,
  subject text,
  body_text text,
  body_html text,
  headers jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index idx_inbound_emails_addr on podio.inbound_emails (app_email_id, created_at desc);

-- Reusable email templates (also used by workflow send-email actions)
create table podio.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references podio.organizations(id) on delete cascade,
  name text not null,
  subject text not null,
  body_html text,
  body_text text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_email_templates_updated before update on podio.email_templates
for each row execute function podio.set_updated_at();

-- Automations: simple when/then rules AND advanced multi-step flows.
--   kind='simple': trigger + conditions + actions jsonb
--   kind='advanced': definition jsonb holds the full flow graph (steps, branches, loops, delays)
create table podio.automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references podio.workspaces(id) on delete cascade,
  app_id uuid references podio.apps(id) on delete cascade,
  name text not null,
  description text,
  kind text not null default 'simple' check (kind in ('simple','advanced')),
  status podio.automation_status not null default 'draft',
  trigger jsonb not null,          -- {type:'item_created'|'item_updated'|'status_changed'|'date_reached'|'task_completed'|'form_submitted'|'comment_added'|'field_matches'|'webhook'|'scheduled'|'manual', ...}
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  definition jsonb,
  version int not null default 1,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_automations_app on podio.automations (app_id) where status = 'active';
create trigger trg_automations_updated before update on podio.automations
for each row execute function podio.set_updated_at();

-- Versioned snapshots of flows
create table podio.automation_revisions (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references podio.automations(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (automation_id, version)
);

-- Execution logs / run history (with retry + error handling state)
create table podio.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references podio.automations(id) on delete cascade,
  item_id uuid references podio.items(id) on delete set null,
  trigger_event jsonb,
  status podio.run_status not null default 'pending',
  attempts int not null default 0,
  logs jsonb not null default '[]'::jsonb,
  error text,
  is_test boolean not null default false,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_auto_runs_automation on podio.automation_runs (automation_id, created_at desc);
create index idx_auto_runs_pending on podio.automation_runs (status) where status in ('pending','running');
