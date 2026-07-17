-- Podio Clone: Migration 76 - Podio-style dashboard tile picker groundwork.
-- New tile kinds beyond the four report kinds: workspace overviews (tasks /
-- calendar / files / contacts), an app content tile, a text tile, and the
-- beyond-Podio web-embed (iframe) and YouTube tiles. Overview/text/embed
-- tiles have no app, so app_id becomes nullable.
alter table podio.dashboard_tiles alter column app_id drop not null;

alter table podio.dashboard_tiles drop constraint dashboard_tiles_kind_check;
alter table podio.dashboard_tiles add constraint dashboard_tiles_kind_check
  check (kind in (
    'count', 'sum', 'avg', 'grouped',          -- reports & charts
    'app',                                      -- app content (recent items)
    'tasks', 'calendar', 'files', 'contacts',   -- workspace overviews
    'text', 'iframe', 'youtube'                 -- text + web embeds
  ));
