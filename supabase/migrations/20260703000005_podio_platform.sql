-- Podio Clone: Migration 5 - Developer platform: API keys, webhooks, templates/marketplace,
-- import/export jobs, audit logs

-- API keys (store only a hash; show the raw key once at creation)
create table podio.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references podio.organizations(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  prefix text not null,
  scopes text[] not null default '{}',
  created_by uuid references auth.users(id),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_api_keys_org on podio.api_keys (organization_id);

-- Webhooks (Podio-style: must be verified before active)
create table podio.webhooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references podio.organizations(id) on delete cascade,
  app_id uuid references podio.apps(id) on delete cascade,
  url text not null,
  events text[] not null, -- item.created, item.updated, item.deleted, comment.created, task.completed, file.attached, form.submitted
  secret text not null,
  verify_token text,
  is_verified boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_webhooks_app on podio.webhooks (app_id) where is_active;
create trigger trg_webhooks_updated before update on podio.webhooks
for each row execute function podio.set_updated_at();

create table podio.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references podio.webhooks(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status podio.run_status not null default 'pending',
  attempts int not null default 0,
  response_status int,
  response_body text,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_wh_deliveries_hook on podio.webhook_deliveries (webhook_id, created_at desc);
create index idx_wh_deliveries_retry on podio.webhook_deliveries (next_retry_at) where status = 'failed';

-- App templates / marketplace (definition = full app schema + views + optional sample data)
create table podio.app_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references podio.organizations(id) on delete cascade, -- null = platform-provided
  name text not null,
  description text,
  category text, -- crm, project_management, help_desk, recruiting, real_estate, accounting, field_service, asset_tracking, client_onboarding, event_management
  definition jsonb not null,
  source_app_id uuid references podio.apps(id) on delete set null,
  visibility text not null default 'org' check (visibility in ('private','org','public')),
  version int not null default 1,
  install_count int not null default 0,
  rating_avg numeric,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_templates_category on podio.app_templates (category) where visibility = 'public';
create trigger trg_app_templates_updated before update on podio.app_templates
for each row execute function podio.set_updated_at();

create table podio.template_installs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references podio.app_templates(id) on delete cascade,
  workspace_id uuid not null references podio.workspaces(id) on delete cascade,
  app_id uuid references podio.apps(id) on delete set null,
  with_sample_data boolean not null default false,
  installed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table podio.template_reviews (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references podio.app_templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  review text,
  created_at timestamptz not null default now(),
  unique (template_id, user_id)
);

-- Import jobs (CSV/XLSX -> app items, background processed)
create table podio.import_jobs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references podio.apps(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  file_id uuid references podio.files(id) on delete set null,
  mapping jsonb not null default '{}'::jsonb,
  status podio.job_status not null default 'queued',
  total_rows int,
  processed_rows int not null default 0,
  error_rows int not null default 0,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_import_jobs_app on podio.import_jobs (app_id, created_at desc);

-- Export jobs (view/app -> CSV/XLSX file, background processed)
create table podio.export_jobs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references podio.apps(id) on delete cascade,
  view_id uuid references podio.app_views(id) on delete set null,
  user_id uuid not null references auth.users(id),
  format text not null default 'xlsx' check (format in ('csv','xlsx')),
  filters jsonb,
  status podio.job_status not null default 'queued',
  file_id uuid references podio.files(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_export_jobs_app on podio.export_jobs (app_id, created_at desc);

-- Organization audit log
create table podio.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references podio.organizations(id) on delete cascade,
  workspace_id uuid references podio.workspaces(id) on delete set null,
  actor_id uuid references auth.users(id),
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index idx_audit_org on podio.audit_logs (organization_id, created_at desc);
