-- Podio Clone: Migration 78 - Workspace embed tabs (beyond-Podio).
-- A tab bar above the workspace dashboard holds saved external embeds
-- (websites, Google Sheets); clicking one shows it full-width inside the
-- workspace without leaving the dashboard. Shared per workspace.
create table podio.workspace_embeds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references podio.workspaces(id) on delete cascade,
  title text not null,
  url text not null,
  position int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table podio.workspace_embeds enable row level security;

create policy p_ws_embeds_select on podio.workspace_embeds
  for select using (podio.is_workspace_member(workspace_id));
create policy p_ws_embeds_write on podio.workspace_embeds
  for all using (podio.is_workspace_member(workspace_id))
  with check (podio.is_workspace_member(workspace_id));

grant select, insert, update, delete on podio.workspace_embeds to authenticated;
