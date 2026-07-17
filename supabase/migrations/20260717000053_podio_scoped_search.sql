-- Podio Clone: Migration 53 - App-scoped search for the inline global-bar search.
-- SECURITY INVOKER (default), same as search_all (migration 15): runs under the
-- caller's RLS, so results are permission-filtered automatically. Unlike
-- search_all, this searches ONE app (real Podio's in-app top-bar search) and
-- adds ILIKE fallbacks on titles/values so type-ahead matches partial words.
create or replace function podio.search_app(
  p_query text,
  p_org text,
  p_ws text,
  p_app text,
  p_limit int default 8
)
returns table(kind text, label text, context text, href text, rank real)
language sql stable set search_path = podio, public as $$
  with app as (
    select a.id, a.name,
      '/org/' || o.slug || '/' || w.slug || '/' || a.slug as base
    from podio.apps a
    join podio.workspaces w on w.id = a.workspace_id
    join podio.organizations o on o.id = w.organization_id
    where a.slug = p_app and w.slug = p_ws and o.slug = p_org
    limit 1
  ),
  q as (select websearch_to_tsquery('simple', p_query) as tsq)
  select kind, label, context, href, rank from (
    -- One row per (kind, href): an item matched by both title and a field
    -- value, or with several matching comments, collapses to its best hit.
    select distinct on (kind, href) * from (

      -- Items by title (tsv word match OR partial-title match for type-ahead)
      select 'item'::text as kind,
        coalesce(i.title, '#' || i.item_number::text) as label,
        app.name as context,
        app.base || '/' || i.item_number as href,
        (greatest(ts_rank(i.search_tsv, q.tsq), 0.1) + 0.1)::real as rank
      from app cross join q
      join podio.items i on i.app_id = app.id and not i.is_deleted
        and (i.search_tsv @@ q.tsq or i.title ilike '%' || p_query || '%')

      union all

      -- Items by field values (grouped so one item = one result)
      select 'item',
        coalesce(i.title, '#' || i.item_number::text),
        app.name || ' — ' || left(max(ifv.value_text), 60),
        app.base || '/' || i.item_number,
        greatest(max(ts_rank(ifv.search_tsv, q.tsq)), 0.05)::real
      from app cross join q
      join podio.items i on i.app_id = app.id and not i.is_deleted
      join podio.item_field_values ifv on ifv.item_id = i.id
        and (ifv.search_tsv @@ q.tsq or ifv.value_text ilike '%' || p_query || '%')
      group by i.id, i.title, i.item_number, app.name, app.base

      union all

      -- Comments on this app's items
      select 'comment', left(c.body, 80),
        'Comment on ' || coalesce(i.title, 'item'),
        app.base || '/' || i.item_number,
        ts_rank(c.search_tsv, q.tsq)::real
      from app cross join q
      join podio.items i on i.app_id = app.id and not i.is_deleted
      join podio.comments c on c.target_type = 'item' and c.target_id = i.id
        and c.deleted_at is null and c.search_tsv @@ q.tsq

    ) all_hits
    order by kind, href, rank desc
  ) deduped
  order by rank desc
  limit p_limit;
$$;
grant execute on function podio.search_app(text, text, text, text, int) to authenticated;
