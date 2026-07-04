-- Podio Clone: Migration 3 - Collaboration: comments, mentions, status posts, activity,
-- notifications, follows, chat, tasks, files

-- Comments (polymorphic: items, tasks, status posts, files)
create table podio.comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references podio.workspaces(id) on delete cascade,
  target_type podio.object_type not null,
  target_id uuid not null,
  created_by uuid not null references auth.users(id),
  body text not null,
  body_rich jsonb,
  is_edited boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (to_tsvector('simple', coalesce(body,''))) stored
);
create index idx_comments_target on podio.comments (target_type, target_id, created_at);
create index idx_comments_search on podio.comments using gin (search_tsv);
create trigger trg_comments_updated before update on podio.comments
for each row execute function podio.set_updated_at();

create table podio.comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references podio.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null default 'like',
  created_at timestamptz not null default now(),
  unique (comment_id, user_id, emoji)
);

-- Mentions (@user or @workspace inside comments/status posts)
create table podio.mentions (
  id uuid primary key default gen_random_uuid(),
  source_type podio.object_type not null,
  source_id uuid not null,
  mentioned_user_id uuid references auth.users(id) on delete cascade,
  mentioned_workspace_id uuid references podio.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (mentioned_user_id is not null or mentioned_workspace_id is not null)
);
create index idx_mentions_user on podio.mentions (mentioned_user_id);

-- Status posts (workspace stream messages)
create table podio.status_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references podio.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  body text not null,
  body_rich jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (to_tsvector('simple', coalesce(body,''))) stored
);
create index idx_status_posts_ws on podio.status_posts (workspace_id, created_at desc);
create trigger trg_status_posts_updated before update on podio.status_posts
for each row execute function podio.set_updated_at();

-- Activity events (home/workspace/app/item feeds)
create table podio.activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references podio.organizations(id) on delete cascade,
  workspace_id uuid references podio.workspaces(id) on delete cascade,
  app_id uuid references podio.apps(id) on delete cascade,
  item_id uuid references podio.items(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_type text not null,
  target_type podio.object_type,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_activity_ws on podio.activity_events (workspace_id, created_at desc);
create index idx_activity_org on podio.activity_events (organization_id, created_at desc);
create index idx_activity_item on podio.activity_events (item_id, created_at desc);

-- Follows (apps/workspaces; item follows live in item_followers) + stream muting
create table podio.follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type podio.object_type not null,
  target_id uuid not null,
  muted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);

-- Notifications
create table podio.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  target_type podio.object_type,
  target_id uuid,
  actor_id uuid references auth.users(id),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_user on podio.notifications (user_id, read_at, created_at desc);

-- Chat: conversations + messages
create table podio.conversations (
  id uuid primary key default gen_random_uuid(),
  subject text,
  is_group boolean not null default false,
  linked_target_type podio.object_type,
  linked_target_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_conversations_updated before update on podio.conversations
for each row execute function podio.set_updated_at();

create table podio.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references podio.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  starred boolean not null default false,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);
create index idx_conv_participants_user on podio.conversation_participants (user_id);

create table podio.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references podio.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz not null default now(),
  search_tsv tsvector generated always as (to_tsvector('simple', coalesce(body,''))) stored
);
create index idx_messages_conv on podio.messages (conversation_id, created_at);
create index idx_messages_search on podio.messages using gin (search_tsv);

-- Tasks (attachable to items or standalone; personal labels; repeating)
create table podio.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references podio.organizations(id) on delete cascade,
  workspace_id uuid references podio.workspaces(id) on delete cascade,
  target_type podio.object_type,
  target_id uuid,
  title text not null,
  description text,
  assignee_id uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  due_at timestamptz,
  all_day boolean not null default true,
  reminder_at timestamptz,
  status podio.task_status not null default 'open',
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  priority smallint,
  is_private boolean not null default false,
  repeat_rule jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,''))) stored
);
create index idx_tasks_assignee on podio.tasks (assignee_id, status, due_at);
create index idx_tasks_target on podio.tasks (target_type, target_id);
create index idx_tasks_ws on podio.tasks (workspace_id);
create index idx_tasks_search on podio.tasks using gin (search_tsv);
create trigger trg_tasks_updated before update on podio.tasks
for each row execute function podio.set_updated_at();

-- Personal, color-coded task labels (visible only to owner)
create table podio.task_labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create table podio.task_label_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references podio.tasks(id) on delete cascade,
  label_id uuid not null references podio.task_labels(id) on delete cascade,
  unique (task_id, label_id)
);

-- Files (Supabase Storage-backed or external provider link) + polymorphic attachments
create table podio.files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references podio.organizations(id) on delete cascade,
  workspace_id uuid references podio.workspaces(id) on delete cascade,
  bucket text not null default 'podio-files',
  storage_path text,
  external_url text,
  provider text not null default 'native',
  name text not null,
  mime_type text,
  size_bytes bigint,
  version int not null default 1,
  previous_version_id uuid references podio.files(id),
  uploaded_by uuid references auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);
create index idx_files_ws on podio.files (workspace_id);
create index idx_files_name on podio.files (name);

create table podio.file_attachments (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references podio.files(id) on delete cascade,
  target_type podio.object_type not null,
  target_id uuid not null,
  attached_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (file_id, target_type, target_id)
);
create index idx_file_attach_target on podio.file_attachments (target_type, target_id);
