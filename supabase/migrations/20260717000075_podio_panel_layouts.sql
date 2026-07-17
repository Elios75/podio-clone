-- Podio Clone: Migration 75 - Account-synced workspace panel layouts.
-- The workspace activity board's drag/resize arrangement used to live in
-- localStorage (per browser). This table stores it per USER per WORKSPACE so
-- the layout follows the account across machines. Shape of `layout` matches
-- the client: { order: string[], sizes: { [panelId]: { w: 2|3|4|6, h?: px } } }.
create table podio.workspace_panel_layouts (
  workspace_id uuid not null references podio.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  layout jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table podio.workspace_panel_layouts enable row level security;

-- Own rows only; writes additionally require workspace membership.
create policy p_wpl_select on podio.workspace_panel_layouts
  for select using (user_id = auth.uid());
create policy p_wpl_insert on podio.workspace_panel_layouts
  for insert with check (user_id = auth.uid() and podio.is_workspace_member(workspace_id));
create policy p_wpl_update on podio.workspace_panel_layouts
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and podio.is_workspace_member(workspace_id));
create policy p_wpl_delete on podio.workspace_panel_layouts
  for delete using (user_id = auth.uid());

grant select, insert, update, delete on podio.workspace_panel_layouts to authenticated;
