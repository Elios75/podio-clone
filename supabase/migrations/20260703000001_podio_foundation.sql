-- Podio Clone: Migration 1 - Foundation
-- Isolated "podio" schema: enums, helpers, tenancy (organizations, workspaces, members)

create schema if not exists podio;

-- Enums
create type podio.org_role as enum ('owner','admin','employee','light','external','guest','service');
create type podio.workspace_role as enum ('admin','member','light','guest');
create type podio.workspace_privacy as enum ('open','private');
create type podio.field_type as enum ('text','category','date','relationship','contact','phone','email','organization','number','money','progress','calculation','location','duration','image','file','link','separator');
create type podio.view_layout as enum ('table','card','calendar','badge','stream','dashboard');
create type podio.view_visibility as enum ('private','team');
create type podio.object_type as enum ('item','task','comment','status_post','file','message','app','workspace','webform_submission');
create type podio.task_status as enum ('open','completed');
create type podio.automation_status as enum ('draft','active','paused');
create type podio.run_status as enum ('pending','running','success','failed','cancelled');
create type podio.job_status as enum ('queued','running','success','failed');
create type podio.share_access as enum ('view','comment','edit');

-- updated_at helper
create or replace function podio.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- User profiles (extends auth.users)
create table podio.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  title text,
  phone text,
  about text,
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_user_profiles_updated before update on podio.user_profiles
for each row execute function podio.set_updated_at();

-- Organizations
create table podio.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  billing_plan text not null default 'free',
  contract_owner uuid references auth.users(id),
  security_settings jsonb not null default '{}'::jsonb,
  default_permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_organizations_updated before update on podio.organizations
for each row execute function podio.set_updated_at();

-- Organization members (employee / light / external / guest / service roles)
create table podio.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references podio.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role podio.org_role not null default 'employee',
  invited_by uuid references auth.users(id),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index idx_org_members_user on podio.organization_members (user_id);

-- Workspaces
create table podio.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references podio.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  icon text,
  color text,
  privacy podio.workspace_privacy not null default 'private',
  auto_join boolean not null default false,
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);
create index idx_workspaces_org on podio.workspaces (organization_id);
create trigger trg_workspaces_updated before update on podio.workspaces
for each row execute function podio.set_updated_at();

-- Workspace members
create table podio.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references podio.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role podio.workspace_role not null default 'member',
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index idx_ws_members_user on podio.workspace_members (user_id);
