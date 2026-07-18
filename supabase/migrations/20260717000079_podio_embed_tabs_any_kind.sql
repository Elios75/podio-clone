-- Podio Clone: Migration 79 - Workspace tabs can hold ANY tile kind.
-- The tab bar's "+" now opens the standard tile picker, so a tab is no
-- longer just an iframe: it stores the same kind/config pair as
-- dashboard_tiles and renders that tile full-canvas. Legacy rows (url only)
-- are backfilled into config.
alter table podio.workspace_embeds
  add column kind text not null default 'iframe',
  add column app_id uuid references podio.apps(id) on delete cascade,
  add column config jsonb not null default '{}'::jsonb;
alter table podio.workspace_embeds alter column url set default '';

update podio.workspace_embeds
  set config = jsonb_build_object('url', url)
  where config = '{}'::jsonb and url <> '';

alter table podio.workspace_embeds add constraint workspace_embeds_kind_check
  check (kind in (
    'count', 'sum', 'avg', 'grouped',
    'app',
    'tasks', 'calendar', 'files', 'contacts',
    'text', 'iframe', 'youtube'
  ));
