-- Podio Clone: Migration 27 - Server-side view engine
-- Compiles view filter/sort jsonb into indexed SQL over item_field_values.
-- Values are %L-escaped; operators pass through a whitelist CASE; field ids are
-- validated against the app before use. Security definer with a single
-- workspace-membership check (per-row RLS would defeat the indexes).
-- NOTE: this file contains the corrected version (an 'lte' typo in the first
-- application was fixed in place on the remote).

create or replace function podio.query_items(
  p_app uuid,
  p_filters jsonb default '[]'::jsonb,
  p_sort jsonb default '[]'::jsonb,
  p_limit int default 100,
  p_offset int default 0
)
returns jsonb
language plpgsql stable security definer set search_path = podio, public as $$
declare
  v_where text := ''; v_join text := ''; v_order text := 'f.created_at desc';
  flt jsonb; v_field uuid; v_op text; v_val text; v_cond text;
  v_sort_field uuid; v_dir text; v_sql text; v_result jsonb;
  v_lim int := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_off int := greatest(coalesce(p_offset, 0), 0);
begin
  if not podio.is_workspace_member(podio.app_workspace(p_app)) then
    raise exception 'not a workspace member';
  end if;
  for flt in select * from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) loop
    select id into v_field from podio.app_fields
    where id = nullif(flt->>'field_id','')::uuid and app_id = p_app;
    if v_field is null then continue; end if;
    v_op := flt->>'op'; v_val := coalesce(flt->>'value', '');
    v_cond := case v_op
      when 'is_empty' then format('not exists (select 1 from podio.item_field_values v where v.item_id = i.id and v.field_id = %L)', v_field)
      when 'not_empty' then format('exists (select 1 from podio.item_field_values v where v.item_id = i.id and v.field_id = %L)', v_field)
      when 'contains' then format('exists (select 1 from podio.item_field_values v where v.item_id = i.id and v.field_id = %L and v.value_text ilike %L)', v_field, '%' || v_val || '%')
      when 'equals' then format('exists (select 1 from podio.item_field_values v where v.item_id = i.id and v.field_id = %L and v.value_text = %L)', v_field, v_val)
      when 'is' then format('exists (select 1 from podio.item_field_values v where v.item_id = i.id and v.field_id = %L and (v.value_text = %L or v.ref_user_id::text = %L or (jsonb_typeof(v.value) = ''array'' and v.value ? %L)))', v_field, v_val, v_val, v_val)
      when 'is_not' then format('not exists (select 1 from podio.item_field_values v where v.item_id = i.id and v.field_id = %L and (v.value_text = %L or v.ref_user_id::text = %L or (jsonb_typeof(v.value) = ''array'' and v.value ? %L)))', v_field, v_val, v_val, v_val)
      when 'eq' then format('exists (select 1 from podio.item_field_values v where v.item_id = i.id and v.field_id = %L and v.value_number = %L::numeric)', v_field, v_val)
      when 'gt' then format('exists (select 1 from podio.item_field_values v where v.item_id = i.id and v.field_id = %L and v.value_number > %L::numeric)', v_field, v_val)
      when 'gte' then format('exists (select 1 from podio.item_field_values v where v.item_id = i.id and v.field_id = %L and v.value_number >= %L::numeric)', v_field, v_val)
      when 'lt' then format('exists (select 1 from podio.item_field_values v where v.item_id = i.id and v.field_id = %L and v.value_number < %L::numeric)', v_field, v_val)
      when 'lte' then format('exists (select 1 from podio.item_field_values v where v.item_id = i.id and v.field_id = %L and v.value_number <= %L::numeric)', v_field, v_val)
      when 'on' then format('exists (select 1 from podio.item_field_values v where v.item_id = i.id and v.field_id = %L and v.value_date >= %L::date and v.value_date < %L::date + interval ''1 day'')', v_field, v_val, v_val)
      when 'before' then format('exists (select 1 from podio.item_field_values v where v.item_id = i.id and v.field_id = %L and v.value_date < %L::date)', v_field, v_val)
      when 'after' then format('exists (select 1 from podio.item_field_values v where v.item_id = i.id and v.field_id = %L and v.value_date >= %L::date + interval ''1 day'')', v_field, v_val)
      else null
    end;
    if v_cond is not null then v_where := v_where || ' and ' || v_cond; end if;
  end loop;
  if jsonb_array_length(coalesce(p_sort, '[]'::jsonb)) > 0 then
    select id into v_sort_field from podio.app_fields
    where id = nullif(p_sort->0->>'field_id','')::uuid and app_id = p_app;
    v_dir := case when p_sort->0->>'dir' = 'desc' then 'desc' else 'asc' end;
    if v_sort_field is not null then
      v_join := format('left join podio.item_field_values s on s.item_id = f.id and s.field_id = %L and s.position = 0', v_sort_field);
      v_order := format('s.value_number %1$s nulls last, s.value_date %1$s nulls last, s.value_text %1$s nulls last, f.created_at desc', v_dir);
    end if;
  end if;
  v_sql := format(
    'with filtered as (
       select i.id, i.item_number, i.title, i.created_at, i.updated_at
       from podio.items i
       where i.app_id = %L and not i.is_deleted %s
     )
     select jsonb_build_object(
       ''total'', (select count(*) from filtered),
       ''items'', coalesce((
         select jsonb_agg(to_jsonb(x)) from (
           select f.id, f.item_number, f.title, f.created_at, f.updated_at
           from filtered f
           %s
           order by %s
           limit %s offset %s
         ) x), ''[]''::jsonb))',
    p_app, v_where, v_join, v_order, v_lim, v_off);
  execute v_sql into v_result;
  return v_result;
end $$;
grant execute on function podio.query_items(uuid, jsonb, jsonb, int, int) to authenticated;
