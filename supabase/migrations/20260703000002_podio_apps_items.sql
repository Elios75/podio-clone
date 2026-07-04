-- Podio Clone: Migration 2 - Apps, dynamic fields, views, items (hybrid EAV), relationships, revisions, tags, sharing

-- Apps: user-defined business objects (like database tables)
create table podio.apps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references podio.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  icon text,
  description text,
  usage_instructions text,
  item_name text not null default 'Item',
  layout_settings jsonb not null default '{}'::jsonb,
  permissions jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  schema_version int not null default 1,
  next_item_number bigint not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
create trigger trg_apps_updated before update on podio.apps
for each row execute function podio.set_updated_at();

-- App fields: dynamic schema. config jsonb holds type-specific settings:
--   category: {options:[{id,label,color}], multiple, display}
--   relationship: {related_app_id, restrict_view_id, allow_create}
--   money: {currencies}, calculation: {formula, output_type}, date: {end_date, calendar}
create table podio.app_fields (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references podio.apps(id) on delete cascade,
  external_id text not null,
  label text not null,
  type podio.field_type not null,
  help_text text,
  description text,
  is_required boolean not null default false,
  is_hidden boolean not null default false,
  hidden_if_empty boolean not null default false,
  is_primary boolean not null default false,
  position int not null default 0,
  default_value jsonb,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, external_id)
);
create index idx_app_fields_app on podio.app_fields (app_id, position);
create trigger trg_app_fields_updated before update on podio.app_fields
for each row execute function podio.set_updated_at();

-- Schema change history for the app builder
create table podio.app_schema_revisions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references podio.apps(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (app_id, version)
);

-- Saved views (filters/sort/grouping/layout, private or team)
create table podio.app_views (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references podio.apps(id) on delete cascade,
  name text not null,
  layout podio.view_layout not null default 'table',
  visibility podio.view_visibility not null default 'team',
  owner_id uuid references auth.users(id),
  filters jsonb not null default '[]'::jsonb,
  sort jsonb not null default '[]'::jsonb,
  group_by jsonb,
  columns jsonb,
  settings jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_app_views_app on podio.app_views (app_id);
create trigger trg_app_views_updated before update on podio.app_views
for each row execute function podio.set_updated_at();

-- Items: the records inside an app
create table podio.items (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references podio.apps(id) on delete cascade,
  item_number bigint not null,
  title text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (to_tsvector('simple', coalesce(title,''))) stored,
  unique (app_id, item_number)
);
create index idx_items_app_created on podio.items (app_id, created_at desc);
create index idx_items_search on podio.items using gin (search_tsv);
create trigger trg_items_updated before update on podio.items
for each row execute function podio.set_updated_at();

-- Per-app sequential item numbers (row-locks the app row to avoid races)
create or replace function podio.assign_item_number() returns trigger
language plpgsql as $$
begin
  update podio.apps set next_item_number = next_item_number + 1
  where id = new.app_id
  returning next_item_number - 1 into new.item_number;
  return new;
end $$;
create trigger trg_items_number before insert on podio.items
for each row when (new.item_number is null or new.item_number = 0)
execute function podio.assign_item_number();

-- Hybrid EAV: one row per field value; typed columns for indexing + jsonb source of truth
create table podio.item_field_values (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references podio.items(id) on delete cascade,
  field_id uuid not null references podio.app_fields(id) on delete cascade,
  position int not null default 0,
  value jsonb not null,
  value_text text,
  value_number numeric,
  value_date timestamptz,
  value_date_end timestamptz,
  ref_item_id uuid references podio.items(id) on delete set null,
  ref_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (to_tsvector('simple', coalesce(value_text,''))) stored,
  unique (item_id, field_id, position)
);
create index idx_ifv_field_text on podio.item_field_values (field_id, value_text);
create index idx_ifv_field_number on podio.item_field_values (field_id, value_number);
create index idx_ifv_field_date on podio.item_field_values (field_id, value_date);
create index idx_ifv_ref_item on podio.item_field_values (ref_item_id);
create index idx_ifv_ref_user on podio.item_field_values (ref_user_id);
create index idx_ifv_value_gin on podio.item_field_values using gin (value);
create index idx_ifv_search on podio.item_field_values using gin (search_tsv);
create trigger trg_ifv_updated before update on podio.item_field_values
for each row execute function podio.set_updated_at();

-- Explicit relationship edges (fast reverse lookups, cross-app/cross-workspace)
create table podio.item_relationships (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references podio.app_fields(id) on delete cascade,
  from_item_id uuid not null references podio.items(id) on delete cascade,
  to_item_id uuid not null references podio.items(id) on delete cascade,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (field_id, from_item_id, to_item_id)
);
create index idx_rel_from on podio.item_relationships (from_item_id);
create index idx_rel_to on podio.item_relationships (to_item_id);

-- Item revision history
create table podio.item_revisions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references podio.items(id) on delete cascade,
  revision int not null,
  user_id uuid references auth.users(id),
  changes jsonb not null,
  created_at timestamptz not null default now(),
  unique (item_id, revision)
);
create index idx_item_revisions_item on podio.item_revisions (item_id, revision desc);

-- Followers (auto-follow on create/edit/comment/assign handled in app code)
create table podio.item_followers (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references podio.items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (item_id, user_id)
);
create index idx_item_followers_user on podio.item_followers (user_id);

-- Single-item guest sharing
create table podio.item_shares (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references podio.items(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  access podio.share_access not null default 'view',
  invited_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (user_id is not null or email is not null)
);
create index idx_item_shares_item on podio.item_shares (item_id);
create index idx_item_shares_user on podio.item_shares (user_id);

-- Tags
create table podio.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references podio.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);
create table podio.item_tags (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references podio.items(id) on delete cascade,
  tag_id uuid not null references podio.tags(id) on delete cascade,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (item_id, tag_id)
);
create index idx_item_tags_tag on podio.item_tags (tag_id);
