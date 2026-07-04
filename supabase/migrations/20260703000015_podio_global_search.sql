-- Podio Clone: Migration 15 - Global search across items, field values, tasks, comments, files.
-- SECURITY INVOKER (default): queries run under the caller's RLS, so results are
-- automatically permission-filtered. No manual access checks needed.
create or replace function podio.search_all(p_query text, p_limit int default 25)
returns table(kind text, label text, context text, href text, rank real)
language sql stable set search_path = podio, public as $$
  with q as (select websearch_to_tsquery('simple', p_query) as tsq)
  select * from (
    -- Items by title
    select 'item'::text as kind,
      coalesce(i.title, '#' || i.item_number::text) as label,
      a.name as context,
      '/org/' || o.slug || '/' || w.slug || '/' || a.slug || '/' || i.item_number as href,
      (ts_rank(i.search_tsv, q.tsq) + 0.1)::real as rank
    from q
    join podio.items i on i.search_tsv @@ q.tsq and not i.is_deleted
    join podio.apps a on a.id = i.app_id
    join podio.workspaces w on w.id = a.workspace_id
    join podio.organizations o on o.id = w.organization_id

    union all

    -- Items by field values (grouped so one item = one result)
    select 'item',
      coalesce(i.title, '#' || i.item_number::text),
      a.name || ' — ' || left(max(ifv.value_text), 60),
      '/org/' || o.slug || '/' || w.slug || '/' || a.slug || '/' || i.item_number,
      max(ts_rank(ifv.search_tsv, q.tsq))::real
    from q
    join podio.item_field_values ifv on ifv.search_tsv @@ q.tsq
    join podio.items i on i.id = ifv.item_id and not i.is_deleted
    join podio.apps a on a.id = i.app_id
    join podio.workspaces w on w.id = a.workspace_id
    join podio.organizations o on o.id = w.organization_id
    group by i.id, i.title, i.item_number, a.name, a.slug, w.slug, o.slug

    union all

    -- Tasks
    select 'task', t.title, 'Task', '/tasks', ts_rank(t.search_tsv, q.tsq)::real
    from q join podio.tasks t on t.search_tsv @@ q.tsq

    union all

    -- Comments (linked back to their item)
    select 'comment', left(c.body, 80),
      'Comment on ' || coalesce(i.title, 'item'),
      '/org/' || o.slug || '/' || w.slug || '/' || a.slug || '/' || i.item_number,
      ts_rank(c.search_tsv, q.tsq)::real
    from q
    join podio.comments c on c.search_tsv @@ q.tsq
      and c.deleted_at is null and c.target_type = 'item'
    join podio.items i on i.id = c.target_id
    join podio.apps a on a.id = i.app_id
    join podio.workspaces w on w.id = a.workspace_id
    join podio.organizations o on o.id = w.organization_id

    union all

    -- Files by name
    select 'file', f.name, 'File',
      coalesce('/org/' || o.slug || '/' || w.slug, '/home'),
      0.05::real
    from q
    join podio.files f on f.name ilike '%' || p_query || '%' and f.deleted_at is null
    left join podio.workspaces w on w.id = f.workspace_id
    left join podio.organizations o on o.id = w.organization_id
  ) results
  order by rank desc
  limit p_limit;
$$;
grant execute on function podio.search_all(text, int) to authenticated;
