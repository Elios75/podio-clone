-- Podio Clone: Migration 26 - Rollup fields
-- Calculation fields gain a second mode: config.rollup = { source_field_id, agg, value_field_id }
-- aggregates over items that reference this item via a relationship field.
-- Changes propagate one hop: editing a Deal recomputes its Company's rollups.

create or replace function podio.compute_calculations(p_item uuid, p_depth int default 0)
returns void
language plpgsql security definer set search_path = podio, public as $$
declare
  v_app uuid;
  f record;
  tok record;
  r record;
  expr text;
  v_num numeric;
  v_agg text;
begin
  select app_id into v_app from podio.items where id = p_item;
  if v_app is null then return; end if;

  for f in
    select * from podio.app_fields
    where app_id = v_app and status = 'active' and type = 'calculation'
  loop
    v_num := null;

    if f.config ? 'rollup' then
      v_agg := coalesce(f.config->'rollup'->>'agg', 'sum');
      select case v_agg
          when 'count' then count(ir.from_item_id)::numeric
          when 'avg' then avg(ifv.value_number)
          else sum(ifv.value_number)
        end
      into v_num
      from podio.item_relationships ir
      left join podio.item_field_values ifv
        on ifv.item_id = ir.from_item_id
       and ifv.field_id = nullif(f.config->'rollup'->>'value_field_id','')::uuid
      join podio.items src on src.id = ir.from_item_id and not src.is_deleted
      where ir.field_id = nullif(f.config->'rollup'->>'source_field_id','')::uuid
        and ir.to_item_id = p_item;
      v_num := coalesce(v_num, 0);

    elsif coalesce(f.config->>'formula','') <> '' then
      expr := f.config->>'formula';
      for tok in
        select af.external_id, coalesce(ifv.value_number, 0) as num
        from podio.app_fields af
        left join podio.item_field_values ifv
          on ifv.field_id = af.id and ifv.item_id = p_item
        where af.app_id = v_app and af.status = 'active' and af.id <> f.id
      loop
        expr := replace(expr, '{' || tok.external_id || '}', tok.num::text);
      end loop;
      if expr ~ '^[0-9+\-*/(). ]+$' then
        begin
          execute 'select (' || expr || ')::numeric' into v_num;
        exception when others then
          v_num := null;
        end;
      end if;
    end if;

    if v_num is not null then
      insert into podio.item_field_values
        (item_id, field_id, position, value, value_number)
      values (p_item, f.id, 0, to_jsonb(round(v_num, 4)), round(v_num, 4))
      on conflict (item_id, field_id, position) do update
        set value = excluded.value, value_number = excluded.value_number,
            updated_at = now();
    end if;
  end loop;

  if p_depth = 0 then
    for r in
      select distinct to_item_id from podio.item_relationships
      where from_item_id = p_item
    loop
      perform podio.compute_calculations(r.to_item_id, 1);
    end loop;
  end if;
end $$;

create or replace function podio.tg_rollup_on_relationship() returns trigger
language plpgsql security definer set search_path = podio, public as $$
begin
  if TG_OP = 'INSERT' then
    perform podio.compute_calculations(new.to_item_id, 1);
    return new;
  else
    perform podio.compute_calculations(old.to_item_id, 1);
    return old;
  end if;
end $$;

drop trigger if exists trg_rollup_rel on podio.item_relationships;
create trigger trg_rollup_rel after insert or delete on podio.item_relationships
for each row execute function podio.tg_rollup_on_relationship();
